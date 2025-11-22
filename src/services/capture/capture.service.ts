/**
 * Main CCTV capture service - orchestrates browser automation and image capture
 */

import path from 'path';
import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright';
import { CapturedImage, CaptureResult, CaptureAnalysisResult } from '../../types';
import { browserConfig, apiConfig } from '../../config';
import { isPermanentError } from '../../infrastructure/retry/error-classifier';
import { analyzeMultipleImages } from '../ai/genai.service';
import { generateWeatherAnalysisPrompt, generateFallbackMessage } from '../../prompts/weather-analysis';
import { getCameraLocation, isCameraOnline } from './camera-selector';
import { captureVideoFrameBase64, isVideoReady, ensureVideoPlaying } from './video-capture';
import { getWITAGreeting } from '../../utils/time';
import { saveImages, ensureDir } from '../../infrastructure/storage/file-manager';

/**
 * Capture a single camera with retry logic
 */
async function captureSingleCamera(
  page: Page,
  card: Locator,
  cameraName: string,
  signal?: { aborted: boolean }
): Promise<CaptureResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= apiConfig.maxRetries + 1; attempt++) {
    // Check if aborted (timeout occurred)
    if (signal?.aborted) {
      return { success: false, error: 'Aborted due to timeout' };
    }

    try {
      const videoLocator = card.locator('video');
      await videoLocator.scrollIntoViewIfNeeded();

      // Ensure video is playing
      await ensureVideoPlaying(videoLocator);

      // Wait for video to be ready
      const ready = await isVideoReady(page, videoLocator, browserConfig.videoReadyTimeout);
      if (!ready) {
        throw new Error('Video stuck buffering');
      }

      // Capture video frame as base64
      const base64Image = await captureVideoFrameBase64(page, videoLocator);
      const location = getCameraLocation(cameraName);

      return { success: true, location, base64Image };
    } catch (err) {
      const error = err as Error;
      lastError = error;

      // Check if this is a permanent error (e.g., element not found, invalid selector)
      if (isPermanentError(error)) {
        console.log(`   Permanent error detected, not retrying: ${error.message}`);
        return { success: false, error: error.message };
      }

      // If this was the last attempt, return failure
      if (attempt > apiConfig.maxRetries) {
        return { success: false, error: error.message };
      }

      // Don't log retry if we might be aborted
      if (!signal?.aborted) {
        // Exponential backoff: 2s, 4s, 8s for browser operations (fast retries)
        const delayMs = 2000 * Math.pow(2, attempt - 1);
        console.log(`   Retry ${attempt}/${apiConfig.maxRetries} after ${delayMs / 1000}s...`);
        await page.waitForTimeout(delayMs);
      }
    }
  }

  return { success: false, error: lastError?.message || 'Max retries exceeded' };
}

/**
 * Capture with timeout - moves to next camera if timeout is reached
 */
async function captureSingleCameraWithTimeout(
  page: Page,
  card: Locator,
  cameraName: string,
  timeout: number
): Promise<CaptureResult> {
  const abortSignal = { aborted: false };

  const timeoutPromise = new Promise<CaptureResult>((resolve) =>
    setTimeout(() => {
      abortSignal.aborted = true;
      resolve({
        success: false,
        error: `Capture timeout after ${timeout / 1000}s`
      });
    }, timeout)
  );

  return Promise.race([
    captureSingleCamera(page, card, cameraName, abortSignal),
    timeoutPromise
  ]);
}

/**
 * Check if there's a next page available
 */
async function hasNextPage(page: Page): Promise<boolean> {
  const nextLink = await page.locator('.pagination a:has-text("Next")').count();
  return nextLink > 0;
}

/**
 * Navigate to the next page
 */
async function goToNextPage(page: Page): Promise<boolean> {
  try {
    const nextLink = page.locator('.pagination a:has-text("Next")');
    const count = await nextLink.count();

    if (count === 0) return false;

    await nextLink.click();

    // Wait for new page to load
    await page.waitForSelector('.cctv-card', { timeout: browserConfig.selectorTimeout });

    // Give videos time to start loading
    await page.waitForTimeout(browserConfig.videoInitWait);

    return true;
  } catch (error) {
    console.error('Error navigating to next page:', error);
    return false;
  }
}

/**
 * Main capture and analysis function
 */
export async function captureAndAnalyze(): Promise<CaptureAnalysisResult> {
  console.log('Starting CCTV Weather Analysis...\n');

  // Launch browser
  const browser: Browser = await chromium.launch({
    headless: browserConfig.headless,
    channel: browserConfig.browserChannel,
    executablePath: browserConfig.chromiumPath,
  });

  const context: BrowserContext = await browser.newContext();
  const page: Page = await context.newPage();

  const capturedImages: CapturedImage[] = [];

  try {
    console.log('Navigating to CCTV Grid...');
    await page.goto(apiConfig.cctvUrl, {
      waitUntil: 'load',
      timeout: browserConfig.pageLoadTimeout,
    });

    // Wait for CCTV cards to be visible
    await page.waitForSelector('.cctv-card', { timeout: browserConfig.selectorTimeout });
    console.log('Page loaded, waiting for streams to initialize...\n');

    // Give videos time to start loading
    await page.waitForTimeout(browserConfig.videoInitWait);

    let capturedCount = 0;
    let currentPage = 1;

    // Loop through pages until we have enough captures
    while (capturedCount < apiConfig.targetCount) {
      // Find all cards on current page
      const cards = await page.locator('.cctv-card').all();
      console.log(`Page ${currentPage}: Found ${cards.length} cameras\n`);

      // Process cameras on current page
      for (const card of cards) {
        if (capturedCount >= apiConfig.targetCount) break;

        const title = (await card.locator('.cctv-header').innerText()).trim();

        // Check if camera is online
        if (!(await isCameraOnline(card))) {
          continue;
        }

        console.log(`[${capturedCount + 1}/${apiConfig.targetCount}] Capturing: "${title}"...`);

        // Capture the camera feed with timeout
        const result = await captureSingleCameraWithTimeout(
          page,
          card,
          title,
          browserConfig.captureTimeout
        );

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

      // Check if we need to go to next page
      if (capturedCount < apiConfig.targetCount) {
        if (await hasNextPage(page)) {
          console.log(`Moving to page ${currentPage + 1}...\n`);
          const success = await goToNextPage(page);
          if (success) {
            currentPage++;
          } else {
            console.log('No more pages available or error navigating.\n');
            break;
          }
        } else {
          console.log('No more pages available.\n');
          break;
        }
      }
    }

    await browser.close();

    if (capturedImages.length === 0) {
      console.error('No images were captured. Cannot perform analysis.');
      throw new Error('No images were captured');
    }

    // Save captured images in debug/development mode (before AI analysis)
    const nodeEnv = process.env.NODE_ENV || 'production';
    if (nodeEnv !== 'production') {
      const capturesDir = path.join('data', 'captures');
      ensureDir(capturesDir);

      // Generate timestamp for this capture session
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      console.log(`\n[DEBUG MODE] Saving captured images to ${capturesDir}/...\n`);
      await saveImages(capturesDir, capturedImages, timestamp);
    }

    // Analyze all images with one prompt
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Analyzing weather conditions across all locations...\n');

    const { greeting, dayName } = getWITAGreeting();
    const prompt = generateWeatherAnalysisPrompt(capturedImages, greeting, dayName);

    let analysis: string;
    try {
      analysis = await analyzeMultipleImages(capturedImages, prompt);
      console.log(analysis.trim());
    } catch (error) {
      console.error('Error analyzing images:', error);
      console.log('\nFallback analysis:');

      analysis = generateFallbackMessage(dayName);
      console.log(analysis);
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
