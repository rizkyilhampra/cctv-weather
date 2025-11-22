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

  // Telegram batch size configuration
  // Maximum images per media group (Telegram API limit is 10)
  // Lower values (e.g., 5) reduce timeout risk but send more batches
  // Set to 0 to disable batching (send all images in one group, not recommended for >10 images)
  telegramBatchSize: parseInt(process.env.TELEGRAM_BATCH_SIZE || '5'),
};
