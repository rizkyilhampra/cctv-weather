/**
 * Local storage fallback service for failed weather reports
 */

import path from 'path';
import { CapturedImage } from '../../types';
import {
  createReportDirectory,
  saveTextFile,
  saveImages,
  createReportReadme,
  listFailedReports as listReports,
  loadFailedReport as loadReport,
  deleteFailedReport as deleteReport,
} from './file-manager';

/**
 * Save a failed weather report locally for manual inspection/retry
 */
export async function saveFailedReport(
  analysis: string,
  images: CapturedImage[],
  error: Error
): Promise<string> {
  const { reportDir } = createReportDirectory();

  // Save the analysis text
  const analysisFile = path.join(reportDir, 'analysis.txt');
  saveTextFile(analysisFile, analysis);

  // Save error information
  const errorFile = path.join(reportDir, 'error.log');
  const errorLog = [
    `Timestamp: ${new Date().toISOString()}`,
    `Error: ${error.message}`,
    `Stack: ${error.stack}`,
    '',
    'This report was saved locally because it could not be sent to Telegram.',
    'You can manually review the analysis and images in this directory.',
  ].join('\n');
  saveTextFile(errorFile, errorLog);

  // Save images
  const imagesDir = path.join(reportDir, 'images');
  const imageMetadata = await saveImages(imagesDir, images);

  // Save image metadata
  const metadataFile = path.join(reportDir, 'images_metadata.json');
  saveTextFile(metadataFile, JSON.stringify(imageMetadata, null, 2));

  // Create a summary README
  createReportReadme(reportDir, error, images.length);

  console.log(`\nReport saved to: ${reportDir}`);
  console.log(`  - Analysis: ${analysisFile}`);
  console.log(`  - Images: ${imagesDir}/ (${images.length} files)`);
  console.log(`  - Error log: ${errorFile}`);

  return reportDir;
}

/**
 * List all failed reports
 */
export function listFailedReports(): string[] {
  return listReports();
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
  return loadReport(timestamp);
}

/**
 * Delete a failed report
 */
export function deleteFailedReport(timestamp: string): boolean {
  return deleteReport(timestamp);
}
