/**
 * Telegram media group handling utilities
 */

import { CapturedImage } from '../../types';

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
 * Split images into batches for Telegram media groups (max 10 per group)
 */
export function batchImages(images: CapturedImage[], maxPerBatch: number = 10): CapturedImage[][] {
  const batches: CapturedImage[][] = [];

  for (let i = 0; i < images.length; i += maxPerBatch) {
    batches.push(images.slice(i, i + maxPerBatch));
  }

  return batches;
}
