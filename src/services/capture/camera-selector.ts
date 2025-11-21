/**
 * Camera selection and validation logic
 */

import { Locator } from 'playwright';

/**
 * Get camera location name from title
 */
export function getCameraLocation(title: string): string {
  return title.trim();
}

/**
 * Check if camera is online and available
 */
export async function isCameraOnline(card: Locator): Promise<boolean> {
  const isBadgeOnline = (await card.locator('.status-badge.online').count()) > 0;
  const isErrorVisible = await card.locator('.error-msg').isVisible();

  return isBadgeOnline && !isErrorVisible;
}
