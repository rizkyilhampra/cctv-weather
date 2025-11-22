/**
 * File management utilities for local storage
 */

import fs from 'fs';
import path from 'path';
import { CapturedImage } from '../../types';
import { sanitizeFilename } from '../../utils/filename';

const FAILED_REPORTS_DIR = 'data/failed_reports';

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Save text file
 */
export function saveTextFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Save images to directory
 */
export function saveImages(
  imagesDir: string,
  images: CapturedImage[],
  timestamp?: string
): Array<{ index: number; location: string; filename: string }> {
  ensureDir(imagesDir);

  const imageMetadata: any[] = [];

  // Use provided timestamp or generate new one
  const fileTimestamp = timestamp || new Date().toISOString().replace(/[:.]/g, '-');

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imagePath = path.join(imagesDir, `${fileTimestamp}_${i + 1}_${sanitizeFilename(img.location)}.png`);

    // Decode base64 and save as PNG
    const buffer = Buffer.from(img.base64, 'base64');
    fs.writeFileSync(imagePath, buffer);

    imageMetadata.push({
      index: i + 1,
      location: img.location,
      filename: path.basename(imagePath),
    });
  }

  return imageMetadata;
}

/**
 * Create report directory with timestamp
 */
export function createReportDirectory(): { reportDir: string; timestamp: string } {
  ensureDir(FAILED_REPORTS_DIR);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.join(FAILED_REPORTS_DIR, timestamp);
  ensureDir(reportDir);

  return { reportDir, timestamp };
}

/**
 * Create README file for failed report
 */
export function createReportReadme(
  reportDir: string,
  error: Error,
  imageCount: number
): void {
  const readme = [
    '════════════════════════════════════════════════════════════════',
    'FAILED WEATHER REPORT - SAVED LOCALLY',
    '════════════════════════════════════════════════════════════════',
    '',
    `Timestamp: ${new Date().toISOString()}`,
    `Report Directory: ${reportDir}`,
    '',
    'CONTENTS:',
    '  - analysis.txt       : Weather analysis text from AI',
    '  - error.log          : Error details that caused the failure',
    '  - images/            : Captured CCTV images (PNG format)',
    '  - images_metadata.json : Image metadata (locations, filenames)',
    '',
    'REASON FOR LOCAL SAVE:',
    `  ${error.message}`,
    '',
    'NEXT STEPS:',
    '  1. Review the analysis and images',
    '  2. Check the error log for details',
    '  3. Manually send to Telegram if needed',
    '  4. Investigate and fix the Telegram sending issue',
    '',
    '════════════════════════════════════════════════════════════════',
  ].join('\n');

  saveTextFile(path.join(reportDir, 'README.txt'), readme);
}

/**
 * List all failed reports
 */
export function listFailedReports(): string[] {
  if (!fs.existsSync(FAILED_REPORTS_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(FAILED_REPORTS_DIR, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .reverse(); // Most recent first
}

/**
 * Load a failed report by timestamp
 */
export function loadFailedReport(timestamp: string): {
  analysis: string;
  error: string;
  imageCount: number;
  reportDir: string;
} | null {
  const reportDir = path.join(FAILED_REPORTS_DIR, timestamp);

  if (!fs.existsSync(reportDir)) {
    return null;
  }

  const analysisFile = path.join(reportDir, 'analysis.txt');
  const errorFile = path.join(reportDir, 'error.log');
  const imagesDir = path.join(reportDir, 'images');

  if (!fs.existsSync(analysisFile) || !fs.existsSync(errorFile)) {
    return null;
  }

  const analysis = fs.readFileSync(analysisFile, 'utf-8');
  const error = fs.readFileSync(errorFile, 'utf-8');

  let imageCount = 0;
  if (fs.existsSync(imagesDir)) {
    imageCount = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png')).length;
  }

  return {
    analysis,
    error,
    imageCount,
    reportDir,
  };
}

/**
 * Delete a failed report
 */
export function deleteFailedReport(timestamp: string): boolean {
  const reportDir = path.join(FAILED_REPORTS_DIR, timestamp);

  if (!fs.existsSync(reportDir)) {
    return false;
  }

  fs.rmSync(reportDir, { recursive: true, force: true });
  return true;
}
