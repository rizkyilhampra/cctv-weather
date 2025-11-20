import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright';
import dotenv from 'dotenv';
import { analyzeMultipleImages } from './genai';

// Load environment variables
dotenv.config();

// CCTV URL - hardcoded since this tool is specifically for this site
const CCTV_URL = 'https://cctv.banjarkab.go.id/grid';

// Configuration with defaults
const config = {
    chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: process.env.HEADLESS === 'true',
    browserChannel: process.env.BROWSER_CHANNEL || 'chrome',
    targetCount: parseInt(process.env.TARGET_COUNT || '3'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '2'),
    pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT || '90000'),
    selectorTimeout: parseInt(process.env.SELECTOR_TIMEOUT || '30000'),
    videoInitWait: parseInt(process.env.VIDEO_INIT_WAIT || '5000'),
    videoReadyTimeout: parseInt(process.env.VIDEO_READY_TIMEOUT || '5000'),
};

export interface CapturedImage {
    location: string;
    base64: string;
}

interface CaptureResult {
    success: boolean;
    location?: string;
    base64Image?: string;
    error?: string;
}

/**
 * Get camera location name from title
 */
function getCameraLocation(title: string): string {
    return title.trim();
}

/**
 * Capture video frame and return as base64
 */
async function captureVideoFrameBase64(
    page: Page,
    videoLocator: Locator
): Promise<string> {
    const base64Image = await videoLocator.evaluate((video) => {
        const canvas = document.createElement('canvas');
        canvas.width = (video as HTMLVideoElement).videoWidth;
        canvas.height = (video as HTMLVideoElement).videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        ctx.drawImage(video as HTMLVideoElement, 0, 0);
        return canvas.toDataURL('image/png');
    });

    // Return base64 without the data:image/png;base64, prefix
    return base64Image.replace(/^data:image\/png;base64,/, '');
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
    cameraName: string
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

            // Capture video frame as base64
            const base64Image = await captureVideoFrameBase64(page, videoLocator);
            const location = getCameraLocation(cameraName);

            return { success: true, location, base64Image };
        } catch (err) {
            const error = err as Error;
            const errorMessage = error.message;

            // If this was the last attempt, return failure
            if (attempt > config.maxRetries) {
                return { success: false, error: errorMessage };
            }

            // Wait a bit before retrying
            await page.waitForTimeout(1000);
        }
    }

    return { success: false, error: 'Max retries exceeded' };
}

export interface CaptureAnalysisResult {
    analysis: string;
    images: CapturedImage[];
}

async function main(): Promise<CaptureAnalysisResult> {
    console.log('Starting CCTV Weather Analysis...\n');

    // Launch browser
    const browser: Browser = await chromium.launch({
        headless: config.headless,
        channel: config.browserChannel as 'chrome',
        executablePath: config.chromiumPath,
    });

    const context: BrowserContext = await browser.newContext();
    const page: Page = await context.newPage();

    const capturedImages: CapturedImage[] = [];

    try {
        console.log('Navigating to CCTV Grid...');
        await page.goto(CCTV_URL, {
            waitUntil: 'load',
            timeout: config.pageLoadTimeout,
        });

        // Wait for CCTV cards to be visible
        await page.waitForSelector('.cctv-card', { timeout: config.selectorTimeout });
        console.log('Page loaded, waiting for streams to initialize...\n');

        // Give videos time to start loading
        await page.waitForTimeout(config.videoInitWait);

        // Find all cards
        const cards = await page.locator('.cctv-card').all();
        console.log(`Found ${cards.length} cameras. Capturing ${config.targetCount} live streams...\n`);

        let capturedCount = 0;

        for (const card of cards) {
            if (capturedCount >= config.targetCount) break;

            const title = (await card.locator('.cctv-header').innerText()).trim();

            // STRICT OFFLINE CHECK
            const isBadgeOnline = (await card.locator('.status-badge.online').count()) > 0;
            const isErrorVisible = await card.locator('.error-msg').isVisible();

            if (!isBadgeOnline || isErrorVisible) {
                continue;
            }

            console.log(`[${capturedCount + 1}/${config.targetCount}] Capturing: "${title}"...`);

            // Capture the camera feed
            const result = await captureSingleCamera(page, card, title);

            if (result.success && result.base64Image && result.location) {
                capturedImages.push({
                    location: result.location,
                    base64: result.base64Image
                });
                console.log(`   ✓ Captured\n`);
                capturedCount++;
            } else {
                console.error(`   ✗ Failed: ${result.error}\n`);
            }
        }

        await browser.close();

        if (capturedImages.length === 0) {
            console.error('No images were captured. Cannot perform analysis.');
            throw new Error('No images were captured');
        }

        // Analyze all images with one prompt
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('Analyzing weather conditions across all locations...\n');

        const locationsList = capturedImages.map((img, idx) => `${idx + 1}. ${img.location}`).join('\n');

        const prompt = `You are analyzing ${capturedImages.length} CCTV camera images from different locations in Kabupaten Banjar, Indonesia.

The locations are:
${locationsList}

For EACH image, determine the weather/road condition using these categories:

1. RAINING - Active rainfall happening now:
   PRIMARY indicators (most important):
   - Visible rain droplets/streaks falling in the air
   - Heavy rain droplets on camera lens (distorting the view)
   - Very low visibility/foggy/hazy atmosphere
   - Water splashing from moving vehicles

   SECONDARY indicators (less reliable):
   - Dark, overcast sky
   - Note: People may use umbrellas for sun protection even when it's clear, so umbrellas alone are NOT a strong indicator

2. WET - Recently rained, roads are wet/becek (muddy):
   - Roads are wet, shiny, or reflective
   - Puddles of water visible on roads
   - Wet surfaces on buildings/sidewalks
   - Good visibility (not foggy)
   - Sky may be clearing but ground is still wet
   - No active rainfall visible

3. DRY - Clear, dry conditions:
   - Dry road surfaces (not shiny/reflective)
   - No puddles
   - Clear visibility
   - Bright or normal lighting conditions
   - No signs of recent rain

Respond in this EXACT format:

LOCATIONS:
1. [Location Name] - [RAINING/WET/DRY]
2. [Location Name] - [RAINING/WET/DRY]
...

SUMMARY:
[2-3 sentences about whether it's raining in Kabupaten Banjar, if roads are wet/becek, and practical footwear advice for travelers]`;

        let analysis: string;
        try {
            analysis = await analyzeMultipleImages(capturedImages, prompt);
            console.log(analysis.trim());
        } catch (error) {
            console.error('Error analyzing images:', error);
            console.log('\nFallback analysis:');

            const fallbackLines = ['LOCATIONS:'];
            capturedImages.forEach((img, idx) => {
                fallbackLines.push(`${idx + 1}. ${img.location} - ANALYSIS FAILED`);
                console.log(`${idx + 1}. ${img.location} - ANALYSIS FAILED`);
            });
            fallbackLines.push('\nSUMMARY:');
            fallbackLines.push('Unable to analyze weather conditions due to an error.');

            console.log('\nSUMMARY:');
            console.log('Unable to analyze weather conditions due to an error.');

            analysis = fallbackLines.join('\n');
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        return {
            analysis: analysis.trim(),
            images: capturedImages
        };

    } catch (error) {
        const err = error as Error;
        console.error('Fatal Error:', err.message);
        await browser.close();
        throw error;
    }
}

export { main };

// Run the main function if this file is executed directly
if (require.main === module) {
    main().catch((error) => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
