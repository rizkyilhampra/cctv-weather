/**
 * Error classification utilities for retry logic
 */

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
