/**
 * API and external service configuration
 */

export const apiConfig = {
  // CCTV URL - hardcoded since this tool is specifically for this site
  cctvUrl: 'https://cctv.banjarkab.go.id/grid',

  // Capture settings
  targetCount: parseInt(process.env.TARGET_COUNT || '3'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '2'),

  // Output directory for snapshots
  outputDir: process.env.OUTPUT_DIR || 'data/snapshots',
};
