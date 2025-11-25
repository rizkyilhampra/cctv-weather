/**
 * Shared type definitions for the CCTV Weather project
 */

import { CCTVSource } from './source.types';

/**
 * Represents a captured CCTV camera image with location metadata
 */
export interface CapturedImage {
  location: string;
  base64: string;
  source?: CCTVSource; // Optional source tag for combined processing
}

/**
 * Result of the capture and analysis operation
 */
export interface CaptureAnalysisResult {
  analysis: string;
  images: CapturedImage[];
}

/**
 * Result of capturing a single camera
 */
export interface CaptureResult {
  success: boolean;
  location?: string;
  base64Image?: string;
  error?: string;
}
