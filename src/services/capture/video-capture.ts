/**
 * Video capture utilities for extracting frames from CCTV streams
 */

import { Page, Locator } from 'playwright';

/**
 * Capture video frame and return as base64
 */
export async function captureVideoFrameBase64(
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

/**
 * Check if video element is ready for capture
 */
export async function isVideoReady(
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

/**
 * Ensure video is playing
 */
export async function ensureVideoPlaying(videoLocator: Locator): Promise<void> {
  await videoLocator.evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    if (v.paused) await v.play().catch(() => {});
  });
}
