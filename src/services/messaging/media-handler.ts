/**
 * Telegram media group handling utilities
 */

import { CapturedImage } from '../../types';
import { apiConfig } from '../../config';

/**
 * Convert captured images to Telegram media format
 */
export function createMediaGroup(images: CapturedImage[], batchStartIndex: number): any[] {
  return images.map((img, index) => {
    const buffer = Buffer.from(img.base64, 'base64');

    return {
      type: 'photo',
      media: buffer,
      fileOptions: {
        filename: `${img.location.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`,
        contentType: 'image/jpeg',
      },
      caption: batchStartIndex + index === 0
        ? `CCTV Images - ${new Date().toLocaleString()}`
        : img.location,
    };
  });
}

/**
 * Split images into batches for Telegram media groups
 *
 * @param images - Array of captured images to batch
 * @param maxPerBatch - Maximum images per batch (defaults to TELEGRAM_BATCH_SIZE from config)
 *                      Set to 0 to disable batching (send all in one group)
 *                      Telegram API max is 10 images per media group
 * @returns Array of image batches
 */
export function batchImages(images: CapturedImage[], maxPerBatch?: number): CapturedImage[][] {
  const batchSize = maxPerBatch ?? apiConfig.telegramBatchSize;

  // If batch size is 0 or >= total images, send all in one batch
  if (batchSize === 0 || batchSize >= images.length) {
    return [images];
  }

  const batches: CapturedImage[][] = [];

  for (let i = 0; i < images.length; i += batchSize) {
    batches.push(images.slice(i, i + batchSize));
  }

  return batches;
}
