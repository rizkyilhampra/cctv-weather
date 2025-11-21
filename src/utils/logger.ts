/**
 * Logging utility functions
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = 'data/logs';

/**
 * Ensure log directory exists
 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Append log entry to a log file
 */
export function appendLog(filename: string, entry: string): void {
  ensureLogDir();
  const logFile = path.join(LOG_DIR, filename);
  fs.appendFileSync(logFile, entry);
}

/**
 * Create a formatted log entry with timestamp
 */
export function formatLogEntry(message: string, metadata?: Record<string, any>): string {
  const timestamp = new Date().toISOString();
  let entry = `[${timestamp}] ${message}`;

  if (metadata) {
    entry += `\n${JSON.stringify(metadata, null, 2)}`;
  }

  return entry + '\n';
}
