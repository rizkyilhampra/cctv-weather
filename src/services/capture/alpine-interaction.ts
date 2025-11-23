import { Page, Locator } from 'playwright';

/**
 * Wait for Alpine.js to initialize on the page
 * @param page - Playwright page instance
 * @param timeout - Maximum wait time in milliseconds
 * @returns true if Alpine.js is detected, false otherwise
 */
export async function waitForAlpineReady(page: Page, timeout: number): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => window.hasOwnProperty('Alpine') && (window as any).Alpine !== undefined,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Trigger Alpine.js video loading by clicking the video container
 * @param page - Playwright page instance
 * @param card - Camera card locator
 * @returns true if click succeeded, false otherwise
 */
export async function loadVideoViaAlpine(
  page: Page,
  card: Locator
): Promise<boolean> {
  try {
    // Find the clickable thumbnail image that triggers loadVideo()
    const thumbnail = card.locator('img[alt="Thumbnail"]');

    if (await thumbnail.count() > 0) {
      // Scroll into view first
      await thumbnail.scrollIntoViewIfNeeded();

      // Click to trigger Alpine.js loadVideo()
      await thumbnail.click();

      // Wait for HLS.js to initialize and start loading
      await page.waitForTimeout(2000);

      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
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
