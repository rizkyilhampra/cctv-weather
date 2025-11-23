import { Page, Locator } from 'playwright';

/**
 * Wait for Alpine.js to initialize on the page
 * Enhanced check: verifies both Alpine.js existence and loadVideo function availability
 * @param page - Playwright page instance
 * @param timeout - Maximum wait time in milliseconds
 * @returns true if Alpine.js is detected, false otherwise
 */
export async function waitForAlpineReady(page: Page, timeout: number): Promise<boolean> {
  try {
    // First: Check if Alpine.js exists
    await page.waitForFunction(
      () => window.hasOwnProperty('Alpine') && (window as any).Alpine !== undefined,
      { timeout: timeout / 2 }
    );

    // Second: Check if loadVideo function is available (defined in page script)
    const loadVideoExists = await page.evaluate(() => {
      return typeof (window as any).loadVideo === 'function';
    });

    if (!loadVideoExists) {
      console.warn('Alpine.js loaded but loadVideo function not found');
      return false;
    }

    // Third: Verify at least one video container with data-url exists
    const hasVideoContainers = await page.locator('.video-container[data-url]').count() > 0;
    if (!hasVideoContainers) {
      console.warn('Alpine.js ready but no video containers found');
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger Alpine.js video loading by clicking the video container
 * Enhanced with retry logic for better reliability
 * @param page - Playwright page instance
 * @param card - Camera card locator
 * @param maxRetries - Maximum number of click attempts (default: 3)
 * @returns true if click succeeded, false otherwise
 */
export async function loadVideoViaAlpine(
  page: Page,
  card: Locator,
  maxRetries: number = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Find the clickable thumbnail image that triggers loadVideo()
      const thumbnail = card.locator('img[alt="Thumbnail"]');
      const thumbnailCount = await thumbnail.count();

      if (thumbnailCount === 0) {
        // No thumbnail found - video might already be loaded or showing error
        return false;
      }

      // Scroll into view first
      await thumbnail.scrollIntoViewIfNeeded();

      // Small delay to ensure element is stable after scrolling
      await page.waitForTimeout(300);

      // Click to trigger Alpine.js loadVideo()
      await thumbnail.click({ timeout: 5000 });

      // Wait for HLS.js to initialize and start loading
      await page.waitForTimeout(2000);

      // Verify the click worked by checking if thumbnail is gone or video appeared
      const thumbnailStillExists = await thumbnail.count() > 0;
      const videoElement = card.locator('video');
      const videoAppeared = await videoElement.count() > 0;

      if (videoAppeared || !thumbnailStillExists) {
        // Success: video element appeared or thumbnail was replaced
        return true;
      }

      // Click didn't work, retry if not last attempt
      if (attempt < maxRetries) {
        console.log(`   Click attempt ${attempt} failed, retrying...`);
        await page.waitForTimeout(1000); // Wait before retry
      }

    } catch (error) {
      if (attempt < maxRetries) {
        console.log(`   Click attempt ${attempt} error: ${(error as Error).message}, retrying...`);
        await page.waitForTimeout(1000); // Wait before retry
      } else {
        return false;
      }
    }
  }

  return false;
}

/**
 * Check if HLS video loaded successfully (not showing error.png)
 * @param card - Camera card locator
 * @returns true if video loaded, false if showing error
 */
export async function isHLSVideoLoaded(card: Locator): Promise<boolean> {
  const errorCount = await card.locator('img[src*="error.png"]').count();
  return errorCount === 0;
}
