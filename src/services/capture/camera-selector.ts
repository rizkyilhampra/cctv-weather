/**
 * Camera selection and validation logic
 */

import { Locator } from 'playwright';
import { SourceConfig } from '../../types/source.types';

/**
 * Get camera location name from title
 */
export function getCameraLocation(title: string): string {
  return title.trim();
}

/**
 * Check if camera is online and available
 * @param card - Camera card locator
 * @param selectors - Source-specific selectors
 * @returns true if camera is online, false otherwise
 */
export async function isCameraOnline(
  card: Locator,
  selectors: SourceConfig['selectors']
): Promise<boolean> {
  // Check online indicator (if defined)
  if (selectors.onlineIndicator) {
    const isBadgeOnline = (await card.locator(selectors.onlineIndicator).count()) > 0;
    if (!isBadgeOnline) return false;
  }

  // Check error indicator (if defined)
  if (selectors.errorIndicator) {
    try {
      const hasError = await card.locator(selectors.errorIndicator).isVisible();
      if (hasError) return false;
    } catch {
      // If error checking fails, assume camera is online
    }
  }

  return true;
}
