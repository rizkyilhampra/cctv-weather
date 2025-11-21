/**
 * Filename utility functions
 */

/**
 * Sanitize filename by removing invalid characters
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9_\-. ]/gi, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}
