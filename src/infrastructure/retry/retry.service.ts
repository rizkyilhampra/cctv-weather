/**
 * Core retry logic with exponential backoff
 */

import { RetryConfig, RetryResult } from '../../types/retry.types';
import { defaultRetryConfig } from '../../config';
import { isTransientError } from './error-classifier';
import { sleep } from '../../utils/sleep';
import { appendLog, formatLogEntry } from '../../utils/logger';

/**
 * Execute an async function with exponential backoff retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig: RetryConfig = {
    ...defaultRetryConfig,
    ...config,
  } as RetryConfig;

  const shouldRetry = finalConfig.shouldRetry || isTransientError;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      // First attempt - no delay
      if (attempt > 0) {
        const delayMs = finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1);

        if (finalConfig.onRetry) {
          finalConfig.onRetry(attempt, lastError!, delayMs);
        } else {
          console.log(`Retry attempt ${attempt}/${finalConfig.maxRetries} after ${delayMs / 1000}s delay...`);
        }

        await sleep(delayMs);
      }

      const result = await operation();

      if (attempt > 0) {
        console.log(`✓ Operation succeeded on attempt ${attempt + 1}`);
      }

      return result;

    } catch (error) {
      lastError = error as Error;

      // Check if we should retry this error
      if (!shouldRetry(lastError)) {
        console.error(`✗ Permanent error detected, not retrying: ${lastError.message}`);
        throw lastError;
      }

      // If this was the last attempt, throw the error
      if (attempt === finalConfig.maxRetries) {
        console.error(`✗ All retry attempts (${finalConfig.maxRetries + 1}) failed`);
        throw lastError;
      }

      // Log the error and continue to next retry
      console.error(`✗ Attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Operation failed');
}

/**
 * Execute an async function with retry logic and return a result object instead of throwing
 */
export async function withRetrySafe<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  let attempts = 0;

  try {
    const result = await withRetry(
      async () => {
        attempts++;
        return await operation();
      },
      config
    );

    return {
      success: true,
      result,
      attempts,
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error,
      attempts,
    };
  }
}

/**
 * Log retry attempts to a file for debugging
 */
export function logRetryAttempt(
  operationName: string,
  attempt: number,
  maxRetries: number,
  error: Error,
  delayMs: number
): void {
  const message = `${operationName} - Attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${delayMs / 1000}s...`;
  const logEntry = formatLogEntry(message);

  appendLog('retry.log', logEntry);
}

// Re-export error classifiers for convenience
export { isTransientError, isPermanentError } from './error-classifier';
