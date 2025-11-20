import fs from 'fs';
import path from 'path';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

const DEFAULT_CONFIG: Partial<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 120000, // 2 minutes
  backoffMultiplier: 2,
};

/**
 * Check if an error is transient and should be retried
 */
export function isTransientError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  const errorString = error.toString().toLowerCase();

  // Network errors
  const networkErrors = [
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'enetunreach',
    'ehostunreach',
    'socket hang up',
    'network error',
    'fetch failed',
  ];

  // HTTP errors
  const httpErrors = [
    '429', // Rate limit
    '500', // Internal server error
    '502', // Bad gateway
    '503', // Service unavailable
    '504', // Gateway timeout
  ];

  // Timeout errors
  const timeoutErrors = [
    'timeout',
    'timed out',
    'deadline exceeded',
  ];

  // Rate limiting
  const rateLimitErrors = [
    'rate limit',
    'too many requests',
    'quota exceeded',
  ];

  // Check if error matches any transient pattern
  const isNetworkError = networkErrors.some(pattern =>
    errorMessage.includes(pattern) || errorString.includes(pattern)
  );
  const isHttpError = httpErrors.some(pattern =>
    errorMessage.includes(pattern) || errorString.includes(pattern)
  );
  const isTimeoutError = timeoutErrors.some(pattern =>
    errorMessage.includes(pattern) || errorString.includes(pattern)
  );
  const isRateLimitError = rateLimitErrors.some(pattern =>
    errorMessage.includes(pattern) || errorString.includes(pattern)
  );

  return isNetworkError || isHttpError || isTimeoutError || isRateLimitError;
}

/**
 * Check if an error is permanent and should NOT be retried
 */
export function isPermanentError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();

  const permanentErrors = [
    'unauthorized',
    'forbidden',
    'not found',
    'bad request',
    '400',
    '401',
    '403',
    '404',
    'invalid',
    'authentication failed',
    'token',
  ];

  return permanentErrors.some(pattern => errorMessage.includes(pattern));
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an async function with exponential backoff retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig: RetryConfig = {
    ...DEFAULT_CONFIG,
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
  const logDir = 'logs';
  const logFile = path.join(logDir, 'retry.log');

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${operationName} - Attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${delayMs / 1000}s...\n`;

  fs.appendFileSync(logFile, logEntry);
}
