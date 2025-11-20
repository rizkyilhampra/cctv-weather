import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// CCTV URL - hardcoded since this tool is specifically for this site
const CCTV_URL = 'https://cctv.banjarkab.go.id/grid';

// Configuration with defaults
const config = {
    chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: process.env.HEADLESS === 'true',
    browserChannel: process.env.BROWSER_CHANNEL || 'chrome',
    targetCount: parseInt(process.env.TARGET_COUNT || '5'),
    outputDir: process.env.OUTPUT_DIR || 'cctv_snapshots',
    maxRetries: parseInt(process.env.MAX_RETRIES || '2'),
    pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT || '90000'),
    selectorTimeout: parseInt(process.env.SELECTOR_TIMEOUT || '30000'),
    videoInitWait: parseInt(process.env.VIDEO_INIT_WAIT || '5000'),
    videoReadyTimeout: parseInt(process.env.VIDEO_READY_TIMEOUT || '5000'),
    errorLogFile: process.env.ERROR_LOG_FILE || 'capture_errors.log',
};

interface CaptureError {
    timestamp: string;
    cameraName: string;
    attempt: number;
    errorMessage: string;
}

interface CaptureResult {
    success: boolean;
    filename?: string;
    error?: string;
}

// Error logging utility
function logError(error: CaptureError): void {
    const logEntry = `[${error.timestamp}] Camera: "${error.cameraName}" | Attempt: ${error.attempt} | Error: ${error.errorMessage}\n`;
    fs.appendFileSync(config.errorLogFile, logEntry);
}

async function captureVideoFrame(
    page: Page,
    videoLocator: Locator,
    filename: string
): Promise<void> {
    const base64Image = await videoLocator.evaluate((video) => {
        const canvas = document.createElement('canvas');
        canvas.width = (video as HTMLVideoElement).videoWidth;
        canvas.height = (video as HTMLVideoElement).videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        ctx.drawImage(video as HTMLVideoElement, 0, 0);
        return canvas.toDataURL('image/png');
    });

    const base64Data = base64Image.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filename, buffer);
}

async function isVideoReady(
    page: Page,
    videoLocator: Locator,
    timeout: number
): Promise<boolean> {
    try {
        const videoElement = await videoLocator.elementHandle();
        if (!videoElement) return false;

        await page.waitForFunction(
            (video) => {
                const v = video as HTMLVideoElement;
                return v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0;
            },
            videoElement,
            { timeout }
        );
        return true;
    } catch (e) {
        return false;
    }
}

// Capture a single camera with retry logic
async function captureSingleCamera(
    page: Page,
    card: Locator,
    cameraName: string,
    outputPath: string
): Promise<CaptureResult> {
    for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
        try {
            const videoLocator = card.locator('video');
            await videoLocator.scrollIntoViewIfNeeded();

            // Ensure video is playing
            await videoLocator.evaluate(async (v: HTMLVideoElement) => {
                v.muted = true;
                if (v.paused) await v.play().catch(() => {});
            });

            // Wait for video to be ready
            const ready = await isVideoReady(page, videoLocator, config.videoReadyTimeout);
            if (!ready) {
                throw new Error('Video stuck buffering');
            }

            // Capture video frame using Canvas API
            await captureVideoFrame(page, videoLocator, outputPath);

            return { success: true, filename: outputPath };
        } catch (err) {
            const error = err as Error;
            const errorMessage = error.message;

            // Log the error
            logError({
                timestamp: new Date().toISOString(),
                cameraName,
                attempt,
                errorMessage,
            });

            // If this was the last attempt, return failure
            if (attempt > config.maxRetries) {
                return { success: false, error: errorMessage };
            }

            // Wait a bit before retrying
            console.log(`   ⚠️ Attempt ${attempt} failed: ${errorMessage}. Retrying...`);
            await page.waitForTimeout(1000);
        }
    }

    return { success: false, error: 'Max retries exceeded' };
}

async function main(): Promise<void> {
    console.log('Starting CCTV capture with configuration:', config);

    // Launch browser
    const browser: Browser = await chromium.launch({
        headless: config.headless,
        channel: config.browserChannel as 'chrome',
        executablePath: config.chromiumPath,
    });

    const context: BrowserContext = await browser.newContext();
    const page: Page = await context.newPage();

    // Create output directory
    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir);
    }

    try {
        console.log('Navigating to Grid...');
        await page.goto(CCTV_URL, {
            waitUntil: 'load',
            timeout: config.pageLoadTimeout,
        });

        // Wait for CCTV cards to be visible
        await page.waitForSelector('.cctv-card', { timeout: config.selectorTimeout });
        console.log('Page loaded, waiting for streams to initialize...');

        // Give videos time to start loading
        await page.waitForTimeout(config.videoInitWait);

        // Find all cards
        const cards = await page.locator('.cctv-card').all();
        console.log(`Found ${cards.length} cameras. Looking for ${config.targetCount} verified live streams...`);

        let capturedCount = 0;
        let failedCount = 0;

        for (const card of cards) {
            if (capturedCount >= config.targetCount) break;

            const title = (await card.locator('.cctv-header').innerText()).trim();

            // STRICT OFFLINE CHECK
            // Check 1: Status Badge
            const isBadgeOnline = (await card.locator('.status-badge.online').count()) > 0;

            // Check 2: Is the "Error/Offline" image visible?
            const isErrorVisible = await card.locator('.error-msg').isVisible();

            if (!isBadgeOnline || isErrorVisible) {
                // Silently skip offline ones
                continue;
            }

            console.log(`\n[${capturedCount + 1}/${config.targetCount}] Processing: "${title}"`);

            const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = path.join(config.outputDir, `${safeTitle}.png`);

            // Attempt capture with retry logic
            const result = await captureSingleCamera(page, card, title, filename);

            if (result.success) {
                console.log(`   ✅ Captured: ${result.filename}`);
                capturedCount++;
            } else {
                console.error(`   ❌ Failed after ${config.maxRetries + 1} attempts: ${result.error}`);
                failedCount++;
            }
        }

        console.log(`\n========== Summary ==========`);
        console.log(`✅ Successfully captured: ${capturedCount}`);
        console.log(`❌ Failed: ${failedCount}`);
        console.log(`📁 Output directory: ${config.outputDir}`);
        if (failedCount > 0) {
            console.log(`📝 Error log: ${config.errorLogFile}`);
        }
        console.log(`=============================`);
    } catch (error) {
        const err = error as Error;
        console.error('Fatal Error:', err.message);
    } finally {
        await browser.close();
    }
}

// Run the main function
main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
