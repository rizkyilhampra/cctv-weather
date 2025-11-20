import fs from 'fs';
import path from 'path';

export interface CapturedImage {
  location: string;
  base64: string;
}

const FAILED_REPORTS_DIR = 'failed_reports';

/**
 * Save a failed weather report locally for manual inspection/retry
 */
export async function saveFailedReport(
  analysis: string,
  images: CapturedImage[],
  error: Error
): Promise<string> {
  // Create failed_reports directory if it doesn't exist
  if (!fs.existsSync(FAILED_REPORTS_DIR)) {
    fs.mkdirSync(FAILED_REPORTS_DIR, { recursive: true });
  }

  // Create a timestamp-based subdirectory for this report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.join(FAILED_REPORTS_DIR, timestamp);
  fs.mkdirSync(reportDir, { recursive: true });

  // Save the analysis text
  const analysisFile = path.join(reportDir, 'analysis.txt');
  fs.writeFileSync(analysisFile, analysis, 'utf-8');

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
  fs.writeFileSync(errorFile, errorLog, 'utf-8');

  // Save images
  const imagesDir = path.join(reportDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const imageMetadata: any[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imagePath = path.join(imagesDir, `${i + 1}_${sanitizeFilename(img.location)}.png`);

    // Decode base64 and save as PNG
    const buffer = Buffer.from(img.base64, 'base64');
    fs.writeFileSync(imagePath, buffer);

    imageMetadata.push({
      index: i + 1,
      location: img.location,
      filename: path.basename(imagePath),
    });
  }

  // Save image metadata
  const metadataFile = path.join(reportDir, 'images_metadata.json');
  fs.writeFileSync(metadataFile, JSON.stringify(imageMetadata, null, 2), 'utf-8');

  // Create a summary README
  const readmeFile = path.join(reportDir, 'README.txt');
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
  fs.writeFileSync(readmeFile, readme, 'utf-8');

  console.log(`\nReport saved to: ${reportDir}`);
  console.log(`  - Analysis: ${analysisFile}`);
  console.log(`  - Images: ${imagesDir}/ (${images.length} files)`);
  console.log(`  - Error log: ${errorFile}`);

  return reportDir;
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9_\-. ]/gi, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100);
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
