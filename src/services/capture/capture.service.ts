/**
 * Main CCTV capture service - orchestrates browser automation and image capture
 */

import path from 'path';
import { chromium, firefox, Browser, BrowserContext, Page, Locator } from 'playwright';
import { CapturedImage, CaptureResult, CaptureAnalysisResult } from '../../types';
import { SourceConfig } from '../../types/source.types';
import { browserConfig, apiConfig } from '../../config';
import { isPermanentError } from '../../infrastructure/retry/error-classifier';
import { analyzeMultipleImages } from '../ai/genai.service';
import { generateWeatherAnalysisPrompt, generateFallbackMessage } from '../../prompts/weather-analysis';
import { getCameraLocation, isCameraOnline } from './camera-selector';
import { captureVideoFrameBase64, isVideoReady, ensureVideoPlaying } from './video-capture';
import { waitForAlpineReady, loadVideoViaAlpine, isHLSVideoLoaded } from './alpine-interaction';
import { getWITAGreeting } from '../../utils/time';
import { saveImages, ensureDir } from '../../infrastructure/storage/file-manager';

/**
 * Launch browser based on configuration
 */
async function launchBrowser(browserType: 'chrome' | 'firefox' = 'chrome'): Promise<Browser> {
  if (browserType === 'firefox') {
    return await firefox.launch({
      headless: browserConfig.headless,
    });
  }

  return await chromium.launch({
    headless: browserConfig.headless,
    channel: browserConfig.browserChannel === 'firefox' ? undefined : browserConfig.browserChannel,
    executablePath: browserConfig.browserChannel === 'firefox' ? undefined :
                   (browserConfig.browserChannel ? undefined : browserConfig.chromiumPath),
  });
}

/**
 * Capture a single camera with retry logic
 */
async function captureSingleCamera(
  page: Page,
  card: Locator,
  cameraName: string,
  sourceConfig: SourceConfig,
  signal?: { aborted: boolean }
): Promise<CaptureResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= apiConfig.maxRetries + 1; attempt++) {
    // Check if aborted (timeout occurred)
    if (signal?.aborted) {
      return { success: false, error: 'Aborted due to timeout' };
    }

    try {
      const videoLocator = card.locator(sourceConfig.selectors.videoElement);
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
  timeout: number,
  sourceConfig: SourceConfig
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
    captureSingleCamera(page, card, cameraName, sourceConfig, abortSignal),
    timeoutPromise
  ]);
}

/**
 * Check if there's a next page available
 */
async function hasNextPage(page: Page, pagination?: SourceConfig['selectors']['pagination']): Promise<boolean> {
  if (!pagination) return false;

  const nextLink = await page.locator(pagination.hasNext).count();
  return nextLink > 0;
}

/**
 * Navigate to the next page
 */
async function goToNextPage(
  page: Page,
  sourceConfig: SourceConfig
): Promise<boolean> {
  if (!sourceConfig.selectors.pagination) return false;

  try {
    const nextLink = page.locator(sourceConfig.selectors.pagination.nextButton);
    const count = await nextLink.count();

    if (count === 0) return false;

    await nextLink.click();

    // Wait for new page to load
    await page.waitForSelector(sourceConfig.selectors.cardContainer, {
      timeout: browserConfig.selectorTimeout
    });

    // Give videos time to start loading
    await page.waitForTimeout(browserConfig.videoInitWait);

    return true;
  } catch (error) {
    console.error('Error navigating to next page:', error);
    return false;
  }
}

/**
 * Interface for tracking failed cameras that need Firefox retry
 */
interface FailedCamera {
  title: string;
  url: string;
}

/**
 * Capture and analyze from multiple sources combined
 * Returns one unified analysis for all sources
 */
export async function captureAndAnalyzeCombined(
  sourceConfigs: SourceConfig[]
): Promise<CaptureAnalysisResult> {
  console.log(`Starting Combined CCTV Weather Analysis for ${sourceConfigs.length} sources...\n`);

  const allCapturedImages: CapturedImage[] = [];
  const displayNames: string[] = [];

  // Capture from each source
  for (const sourceConfig of sourceConfigs) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Capturing from: ${sourceConfig.displayName}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      // Capture from this source (without AI analysis)
      const images = await captureFromSource(sourceConfig);

      // Tag images with source
      const taggedImages = images.map(img => ({
        ...img,
        source: sourceConfig.source
      }));

      allCapturedImages.push(...taggedImages);
      displayNames.push(sourceConfig.displayName);

      console.log(`\n✓ Captured ${images.length} image(s) from ${sourceConfig.displayName}\n`);
    } catch (error) {
      const err = error as Error;
      console.error(`\n✗ Failed to capture from ${sourceConfig.displayName}: ${err.message}`);
      console.log('Continuing with other sources...\n');
      // Continue with other sources even if one fails
    }
  }

  if (allCapturedImages.length === 0) {
    console.error('No images were captured from any source. Cannot perform analysis.');
    throw new Error('No images were captured from any source');
  }

  // Save captured images in debug/development mode (before AI analysis)
  const nodeEnv = process.env.NODE_ENV || 'production';
  if (nodeEnv !== 'production') {
    const capturesDir = path.join('data', 'captures');
    ensureDir(capturesDir);

    // Generate timestamp for this capture session
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    console.log(`\n[DEBUG MODE] Saving captured images to ${capturesDir}/...\n`);
    await saveImages(capturesDir, allCapturedImages, timestamp);
  }

  // Analyze all images with one prompt
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Analyzing weather conditions across all ${allCapturedImages.length} locations from ${displayNames.join(' & ')}...\n`);

  const { greeting, dayName } = getWITAGreeting();
  const combinedDisplayName = displayNames.join(' & ');
  const prompt = generateWeatherAnalysisPrompt(allCapturedImages, greeting, dayName, combinedDisplayName);

  let analysis: string;
  try {
    analysis = await analyzeMultipleImages(allCapturedImages, prompt);
    console.log(analysis.trim());
  } catch (error) {
    console.error('Error analyzing images:', error);
    console.log('\nFallback analysis:');

    analysis = generateFallbackMessage(dayName, combinedDisplayName);
    console.log(analysis);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return {
    analysis: analysis.trim(),
    images: allCapturedImages
  };
}

/**
 * Capture images from a single source (without AI analysis)
 * Helper function for combined capture
 */
async function captureFromSource(sourceConfig: SourceConfig): Promise<CapturedImage[]> {
  // Determine initial browser type
  const initialBrowserType = browserConfig.browserChannel === 'firefox' ? 'firefox' : 'chrome';
  const browser: Browser = await launchBrowser(initialBrowserType);

  const context: BrowserContext = await browser.newContext();
  const page: Page = await context.newPage();

  const capturedImages: CapturedImage[] = [];
  const failedCameras: FailedCamera[] = []; // Track cameras that failed HLS loading

  try {
    console.log(`Navigating to ${sourceConfig.url}...`);
    await page.goto(sourceConfig.url, {
      waitUntil: 'load',
      timeout: browserConfig.pageLoadTimeout,
    });

    // Wait for camera cards to be visible
    await page.waitForSelector(sourceConfig.selectors.cardContainer, {
      timeout: browserConfig.selectorTimeout
    });

    // Banjarbaru-specific: Wait for Alpine.js
    if (sourceConfig.requiresClick && sourceConfig.alpineWaitTime) {
      console.log('Waiting for Alpine.js to initialize...');
      const alpineReady = await waitForAlpineReady(page, sourceConfig.alpineWaitTime);
      if (!alpineReady) {
        console.warn('Alpine.js may not be ready, proceeding anyway...');
      }
    }

    console.log('Page loaded, waiting for initialization...\n');

    // Give videos time to start loading
    await page.waitForTimeout(browserConfig.videoInitWait);

    let capturedCount = 0;
    let currentPage = 1;

    // Use source-specific target count if configured, otherwise use global default
    const targetCount = sourceConfig.targetCount ?? apiConfig.targetCount;

    console.log(`Target: ${targetCount} camera(s)`);
    if (sourceConfig.filterKeyword) {
      console.log(`Filter: Only cameras matching "${sourceConfig.filterKeyword}" (case-insensitive)\n`);
    } else {
      console.log();
    }

    // Loop through pages until we have enough captures
    while (capturedCount < targetCount) {
      // Find all cards on current page
      const cards = await page.locator(sourceConfig.selectors.cardContainer).all();
      console.log(`Page ${currentPage}: Found ${cards.length} cameras\n`);

      // Process cameras on current page
      for (const card of cards) {
        if (capturedCount >= targetCount) break;

        // Try to get camera title - skip if it fails
        let title: string;
        try {
          title = (await card.locator(sourceConfig.selectors.cardTitle).innerText()).trim();
        } catch (err) {
          const error = err as Error;
          console.error(`   ✗ Failed to get camera title (${error.message}), skipping...\n`);
          continue;
        }

        // Apply filter if configured (case-insensitive match)
        if (sourceConfig.filterKeyword) {
          const matchesFilter = title.toLowerCase().includes(sourceConfig.filterKeyword.toLowerCase());
          if (!matchesFilter) {
            // Skip cameras that don't match the filter
            continue;
          }
        }

        // Check if camera is online
        if (!(await isCameraOnline(card, sourceConfig.selectors))) {
          continue;
        }

        console.log(`[${capturedCount + 1}/${targetCount}] Capturing: "${title}"...`);

        // Banjarbaru-specific: Trigger video loading via Alpine.js click
        if (sourceConfig.requiresClick) {
          const clicked = await loadVideoViaAlpine(page, card);
          if (!clicked) {
            console.error(`   ✗ Failed to trigger video load\n`);
            continue;
          }

          // Check if HLS loaded successfully (not error.png)
          if (!(await isHLSVideoLoaded(card))) {
            console.error(`   ✗ Video failed to load (showing error)\n`);

            // Track for Firefox retry if enabled and using Chrome
            if (browserConfig.enableFirefoxFallback && initialBrowserType === 'chrome') {
              failedCameras.push({ title, url: sourceConfig.url });
              console.log(`   → Will retry with Firefox\n`);
            }
            continue;
          }
        }

        // Capture the camera feed with timeout
        const result = await captureSingleCameraWithTimeout(
          page,
          card,
          title,
          browserConfig.captureTimeout,
          sourceConfig
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
      if (capturedCount < targetCount) {
        if (await hasNextPage(page, sourceConfig.selectors.pagination)) {
          console.log(`Moving to page ${currentPage + 1}...\n`);
          const success = await goToNextPage(page, sourceConfig);
          if (success) {
            currentPage++;
          } else {
            console.log('No more pages available or error navigating.\n');
            break;
          }
        } else {
          if (sourceConfig.selectors.pagination) {
            console.log('No more pages available.\n');
          }
          break;
        }
      }
    }

    await browser.close();

    // Firefox fallback: Retry failed cameras with Firefox
    if (
      browserConfig.enableFirefoxFallback &&
      initialBrowserType === 'chrome' &&
      failedCameras.length > 0 &&
      capturedCount < targetCount
    ) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`\n🦊 Retrying ${failedCameras.length} failed camera(s) with Firefox...\n`);

      const firefoxBrowser = await launchBrowser('firefox');
      const firefoxContext = await firefoxBrowser.newContext();
      const firefoxPage = await firefoxContext.newPage();

      try {
        await firefoxPage.goto(sourceConfig.url, {
          waitUntil: 'load',
          timeout: browserConfig.pageLoadTimeout,
        });

        await firefoxPage.waitForSelector(sourceConfig.selectors.cardContainer, {
          timeout: browserConfig.selectorTimeout
        });

        if (sourceConfig.requiresClick && sourceConfig.alpineWaitTime) {
          const alpineReady = await waitForAlpineReady(firefoxPage, sourceConfig.alpineWaitTime);
          if (!alpineReady) {
            console.warn('Alpine.js may not be ready in Firefox, proceeding anyway...');
          }
        }

        await firefoxPage.waitForTimeout(browserConfig.videoInitWait);

        // Process each failed camera
        for (const failedCamera of failedCameras) {
          if (capturedCount >= targetCount) break;

          const cards = await firefoxPage.locator(sourceConfig.selectors.cardContainer).all();

          for (const card of cards) {
            let title: string;
            try {
              title = (await card.locator(sourceConfig.selectors.cardTitle).innerText()).trim();
            } catch {
              continue;
            }

            // Only process the specific failed camera
            if (title !== failedCamera.title) continue;

            console.log(`[${capturedCount + 1}/${targetCount}] Retrying: "${title}"...`);

            // Check if camera is online
            if (!(await isCameraOnline(card, sourceConfig.selectors))) {
              continue;
            }

            // Trigger video loading
            if (sourceConfig.requiresClick) {
              const clicked = await loadVideoViaAlpine(firefoxPage, card);
              if (!clicked) {
                console.error(`   ✗ Failed to trigger video load in Firefox\n`);
                continue;
              }

              if (!(await isHLSVideoLoaded(card))) {
                console.error(`   ✗ Video still failed to load in Firefox\n`);
                continue;
              }
            }

            // Capture the camera feed
            const result = await captureSingleCameraWithTimeout(
              firefoxPage,
              card,
              title,
              browserConfig.captureTimeout,
              sourceConfig
            );

            if (result.success && result.base64Image && result.location) {
              capturedImages.push({
                location: result.location,
                base64: result.base64Image
              });
              console.log(`   ✓ Captured with Firefox\n`);
              capturedCount++;
            } else {
              console.error(`   ✗ Failed in Firefox: ${result.error}\n`);
            }

            break; // Move to next failed camera
          }
        }
      } catch (error) {
        console.error('Firefox retry error:', error);
      } finally {
        await firefoxBrowser.close();
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }
    }

    return capturedImages;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * Main capture and analysis function
 */
export async function captureAndAnalyze(sourceConfig: SourceConfig): Promise<CaptureAnalysisResult> {
  console.log(`Starting CCTV Weather Analysis for ${sourceConfig.displayName}...\n`);

  // Determine initial browser type
  const initialBrowserType = browserConfig.browserChannel === 'firefox' ? 'firefox' : 'chrome';
  const browser: Browser = await launchBrowser(initialBrowserType);

  const context: BrowserContext = await browser.newContext();
  const page: Page = await context.newPage();

  const capturedImages: CapturedImage[] = [];
  const failedCameras: FailedCamera[] = []; // Track cameras that failed HLS loading

  try {
    console.log(`Navigating to ${sourceConfig.url}...`);
    await page.goto(sourceConfig.url, {
      waitUntil: 'load',
      timeout: browserConfig.pageLoadTimeout,
    });

    // Wait for camera cards to be visible
    await page.waitForSelector(sourceConfig.selectors.cardContainer, {
      timeout: browserConfig.selectorTimeout
    });

    // Banjarbaru-specific: Wait for Alpine.js
    if (sourceConfig.requiresClick && sourceConfig.alpineWaitTime) {
      console.log('Waiting for Alpine.js to initialize...');
      const alpineReady = await waitForAlpineReady(page, sourceConfig.alpineWaitTime);
      if (!alpineReady) {
        console.warn('Alpine.js may not be ready, proceeding anyway...');
      }
    }

    console.log('Page loaded, waiting for initialization...\n');

    // Give videos time to start loading
    await page.waitForTimeout(browserConfig.videoInitWait);

    let capturedCount = 0;
    let currentPage = 1;

    // Use source-specific target count if configured, otherwise use global default
    const targetCount = sourceConfig.targetCount ?? apiConfig.targetCount;

    console.log(`Target: ${targetCount} camera(s)`);
    if (sourceConfig.filterKeyword) {
      console.log(`Filter: Only cameras matching "${sourceConfig.filterKeyword}" (case-insensitive)\n`);
    } else {
      console.log();
    }

    // Loop through pages until we have enough captures
    while (capturedCount < targetCount) {
      // Find all cards on current page
      const cards = await page.locator(sourceConfig.selectors.cardContainer).all();
      console.log(`Page ${currentPage}: Found ${cards.length} cameras\n`);

      // Process cameras on current page
      for (const card of cards) {
        if (capturedCount >= targetCount) break;

        // Try to get camera title - skip if it fails
        let title: string;
        try {
          title = (await card.locator(sourceConfig.selectors.cardTitle).innerText()).trim();
        } catch (err) {
          const error = err as Error;
          console.error(`   ✗ Failed to get camera title (${error.message}), skipping...\n`);
          continue;
        }

        // Apply filter if configured (case-insensitive match)
        if (sourceConfig.filterKeyword) {
          const matchesFilter = title.toLowerCase().includes(sourceConfig.filterKeyword.toLowerCase());
          if (!matchesFilter) {
            // Skip cameras that don't match the filter
            continue;
          }
        }

        // Check if camera is online
        if (!(await isCameraOnline(card, sourceConfig.selectors))) {
          continue;
        }

        console.log(`[${capturedCount + 1}/${targetCount}] Capturing: "${title}"...`);

        // Banjarbaru-specific: Trigger video loading via Alpine.js click
        if (sourceConfig.requiresClick) {
          const clicked = await loadVideoViaAlpine(page, card);
          if (!clicked) {
            console.error(`   ✗ Failed to trigger video load\n`);
            continue;
          }

          // Check if HLS loaded successfully (not error.png)
          if (!(await isHLSVideoLoaded(card))) {
            console.error(`   ✗ Video failed to load (showing error)\n`);

            // Track for Firefox retry if enabled and using Chrome
            if (browserConfig.enableFirefoxFallback && initialBrowserType === 'chrome') {
              failedCameras.push({ title, url: sourceConfig.url });
              console.log(`   → Will retry with Firefox\n`);
            }
            continue;
          }
        }

        // Capture the camera feed with timeout
        const result = await captureSingleCameraWithTimeout(
          page,
          card,
          title,
          browserConfig.captureTimeout,
          sourceConfig
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
      if (capturedCount < targetCount) {
        if (await hasNextPage(page, sourceConfig.selectors.pagination)) {
          console.log(`Moving to page ${currentPage + 1}...\n`);
          const success = await goToNextPage(page, sourceConfig);
          if (success) {
            currentPage++;
          } else {
            console.log('No more pages available or error navigating.\n');
            break;
          }
        } else {
          if (sourceConfig.selectors.pagination) {
            console.log('No more pages available.\n');
          }
          break;
        }
      }
    }

    await browser.close();

    // Firefox fallback: Retry failed cameras with Firefox
    if (
      browserConfig.enableFirefoxFallback &&
      initialBrowserType === 'chrome' &&
      failedCameras.length > 0 &&
      capturedCount < targetCount
    ) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`\n🦊 Retrying ${failedCameras.length} failed camera(s) with Firefox...\n`);

      const firefoxBrowser = await launchBrowser('firefox');
      const firefoxContext = await firefoxBrowser.newContext();
      const firefoxPage = await firefoxContext.newPage();

      try {
        await firefoxPage.goto(sourceConfig.url, {
          waitUntil: 'load',
          timeout: browserConfig.pageLoadTimeout,
        });

        await firefoxPage.waitForSelector(sourceConfig.selectors.cardContainer, {
          timeout: browserConfig.selectorTimeout
        });

        if (sourceConfig.requiresClick && sourceConfig.alpineWaitTime) {
          const alpineReady = await waitForAlpineReady(firefoxPage, sourceConfig.alpineWaitTime);
          if (!alpineReady) {
            console.warn('Alpine.js may not be ready in Firefox, proceeding anyway...');
          }
        }

        await firefoxPage.waitForTimeout(browserConfig.videoInitWait);

        // Process each failed camera
        for (const failedCamera of failedCameras) {
          if (capturedCount >= targetCount) break;

          const cards = await firefoxPage.locator(sourceConfig.selectors.cardContainer).all();

          for (const card of cards) {
            let title: string;
            try {
              title = (await card.locator(sourceConfig.selectors.cardTitle).innerText()).trim();
            } catch {
              continue;
            }

            // Only process the specific failed camera
            if (title !== failedCamera.title) continue;

            console.log(`[${capturedCount + 1}/${targetCount}] Retrying: "${title}"...`);

            // Check if camera is online
            if (!(await isCameraOnline(card, sourceConfig.selectors))) {
              continue;
            }

            // Trigger video loading
            if (sourceConfig.requiresClick) {
              const clicked = await loadVideoViaAlpine(firefoxPage, card);
              if (!clicked) {
                console.error(`   ✗ Failed to trigger video load in Firefox\n`);
                continue;
              }

              if (!(await isHLSVideoLoaded(card))) {
                console.error(`   ✗ Video still failed to load in Firefox\n`);
                continue;
              }
            }

            // Capture the camera feed
            const result = await captureSingleCameraWithTimeout(
              firefoxPage,
              card,
              title,
              browserConfig.captureTimeout,
              sourceConfig
            );

            if (result.success && result.base64Image && result.location) {
              capturedImages.push({
                location: result.location,
                base64: result.base64Image
              });
              console.log(`   ✓ Captured with Firefox\n`);
              capturedCount++;
            } else {
              console.error(`   ✗ Failed in Firefox: ${result.error}\n`);
            }

            break; // Move to next failed camera
          }
        }
      } catch (error) {
        console.error('Firefox retry error:', error);
      } finally {
        await firefoxBrowser.close();
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      }
    }

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
    const prompt = generateWeatherAnalysisPrompt(capturedImages, greeting, dayName, sourceConfig.displayName);

    let analysis: string;
    try {
      analysis = await analyzeMultipleImages(capturedImages, prompt);
      console.log(analysis.trim());
    } catch (error) {
      console.error('Error analyzing images:', error);
      console.log('\nFallback analysis:');

      analysis = generateFallbackMessage(dayName, sourceConfig.displayName);
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
