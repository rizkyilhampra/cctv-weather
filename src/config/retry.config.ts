/**
 * Retry mechanism default configuration
 */

import { RetryConfig } from '../types/retry.types';

export const defaultRetryConfig: Partial<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 120000, // 2 minutes
  backoffMultiplier: 2,
};

/**
 * Retry configuration for different operations
 */
export const retryConfigs = {
  // AI analysis retries (longer delays)
  ai: {
    maxRetries: 3,
    initialDelayMs: 120000, // 2 minutes
    backoffMultiplier: 2,
  },

  // Telegram API retries (fast retries for network issues)
  telegram: {
    maxRetries: 3,
    initialDelayMs: 2000, // 2 seconds
    backoffMultiplier: 2,
  },

  // Telegram media retries (no retry on 504 to prevent duplicates)
  telegramMedia: {
    maxRetries: 3,
    initialDelayMs: 2000, // 2 seconds
    backoffMultiplier: 2,
    shouldRetry: (error: Error) => {
      const errorMessage = error.message.toLowerCase();
      // Don't retry 504 Gateway Timeout - likely already succeeded
      if (errorMessage.includes('504')) {
        return false;
      }
      // Retry other transient errors (network, 429, 500, 502, 503)
      return (
        errorMessage.includes('econnreset') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('etimedout') ||
        errorMessage.includes('429') ||
        errorMessage.includes('500') ||
        errorMessage.includes('502') ||
        errorMessage.includes('503')
      );
    },
  },

  // Telegram error notifications (fewer retries, fast)
  telegramError: {
    maxRetries: 2,
    initialDelayMs: 1000, // 1 second
    backoffMultiplier: 2,
  },

  // Browser capture retries (fast retries)
  browserCapture: {
    maxRetries: 2,
    initialDelayMs: 2000, // 2 seconds
    backoffMultiplier: 2,
  },
};
