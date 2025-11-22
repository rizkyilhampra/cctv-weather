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
