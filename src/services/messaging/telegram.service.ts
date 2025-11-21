// Enable improved file handling behavior
process.env.NTBA_FIX_350 = '1';

import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { CapturedImage } from '../../types';
import { withRetry, withRetrySafe } from '../../infrastructure/retry/retry.service';
import { logRetryAttempt } from '../../infrastructure/retry/retry.service';
import { retryConfigs } from '../../config';
import { createMediaGroup, batchImages } from './media-handler';

class TelegramService {
  private bot: TelegramBot | null = null;
  private chatId: string;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables');
    }

    if (!chatId) {
      throw new Error('TELEGRAM_CHAT_ID is not set in environment variables');
    }

    this.chatId = chatId;
    this.bot = new TelegramBot(token, { polling: false });
  }

  /**
   * Send weather analysis report with images to Telegram channel
   */
  async sendWeatherReport(analysis: string, images: CapturedImage[]): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot is not initialized');
    }

    console.log(`Sending weather report to Telegram channel ${this.chatId}...`);

    // Send images first if available
    if (images.length > 0) {
      console.log(`Sending ${images.length} images to Telegram...`);

      const batches = batchImages(images);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchStartIndex = batchIndex * 10;

        // Try to send media group with retry
        const result = await withRetrySafe(
          async () => {
            const media = createMediaGroup(batch, batchStartIndex);
            await this.bot!.sendMediaGroup(this.chatId, media);
          },
          {
            ...retryConfigs.telegram,
            onRetry: (attempt, error, delayMs) => {
              console.log(`\nFailed to send media group (batch ${batchIndex + 1}): ${error.message}`);
              logRetryAttempt('sendMediaGroup', attempt, retryConfigs.telegram.maxRetries, error, delayMs);
            },
          }
        );

        // If media group failed after retries, log warning but continue
        if (!result.success) {
          console.warn(`\n⚠️  Failed to send images (batch ${batchIndex + 1}) after ${result.attempts} attempts`);
          console.warn('Will still attempt to send analysis text');

          // Try to notify user about missing images
          try {
            await this.bot.sendMessage(
              this.chatId,
              `⚠️ Note: Could not send ${batch.length} images due to: ${result.error?.message}`
            );
          } catch (notifyError) {
            console.error('Could not send image failure notification:', notifyError);
          }

          // Continue with next batch instead of failing completely
          continue;
        }

        // Small delay between batches to avoid rate limiting
        if (batchIndex + 1 < batches.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Send the analysis text after images with retry
    await withRetry(
      async () => {
        await this.bot!.sendMessage(this.chatId, analysis, {
          parse_mode: 'Markdown',
        });
      },
      {
        ...retryConfigs.telegram,
        onRetry: (attempt, error, delayMs) => {
          console.log(`\nFailed to send analysis text: ${error.message}`);
          logRetryAttempt('sendMessage (analysis)', attempt, retryConfigs.telegram.maxRetries, error, delayMs);
        },
      }
    );

    console.log('Weather report sent successfully to Telegram!');
  }

  /**
   * Send a simple text message to the channel
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot is not initialized');
    }

    await withRetry(
      async () => {
        await this.bot!.sendMessage(this.chatId, message);
      },
      {
        ...retryConfigs.telegram,
        onRetry: (attempt, error, delayMs) => {
          console.log(`\nFailed to send message: ${error.message}`);
          logRetryAttempt('sendMessage', attempt, retryConfigs.telegram.maxRetries, error, delayMs);
        },
      }
    );

    console.log('Message sent to Telegram successfully');
  }

  /**
   * Send an error notification to the channel
   */
  async sendError(error: Error): Promise<void> {
    const errorMessage = `⚠️ *Error in Weather Analysis*\n\n\`\`\`\n${error.message}\n\`\`\``;

    // Use safe retry - don't throw if this fails
    const result = await withRetrySafe(
      async () => {
        await this.bot!.sendMessage(this.chatId, errorMessage, {
          parse_mode: 'Markdown',
        });
      },
      {
        ...retryConfigs.telegramError,
        onRetry: (attempt, error, delayMs) => {
          console.log(`\nFailed to send error notification: ${error.message}`);
          logRetryAttempt('sendError', attempt, retryConfigs.telegramError.maxRetries, error, delayMs);
        },
      }
    );

    if (!result.success) {
      console.error('Failed to send error notification to Telegram after retries');
      console.error('Original error:', error.message);
      console.error('Notification error:', result.error?.message);

      // Last resort: write to local error log
      this.logErrorLocally(error, result.error);
    }
  }

  /**
   * Log errors locally when Telegram notification fails
   */
  private logErrorLocally(originalError: Error, notificationError?: Error): void {
    const logDir = 'data/logs';
    const logFile = path.join(logDir, 'telegram_errors.log');

    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const logEntry = [
        `\n${'='.repeat(80)}`,
        `[${timestamp}] TELEGRAM ERROR NOTIFICATION FAILED`,
        `${'='.repeat(80)}`,
        `Original Error: ${originalError.message}`,
        `Stack: ${originalError.stack}`,
        notificationError ? `\nNotification Error: ${notificationError.message}` : '',
        `${'='.repeat(80)}\n`,
      ].join('\n');

      fs.appendFileSync(logFile, logEntry);
      console.log(`Error logged to: ${logFile}`);
    } catch (logError) {
      console.error('Failed to write error log:', logError);
    }
  }
}

// Export a singleton instance
let telegramService: TelegramService | null = null;

export function getTelegramService(): TelegramService {
  if (!telegramService) {
    telegramService = new TelegramService();
  }
  return telegramService;
}

export async function sendWeatherReport(analysis: string, images: CapturedImage[]): Promise<void> {
  const service = getTelegramService();
  await service.sendWeatherReport(analysis, images);
}

export async function sendMessage(message: string): Promise<void> {
  const service = getTelegramService();
  await service.sendMessage(message);
}

export async function sendError(error: Error): Promise<void> {
  const service = getTelegramService();
  await service.sendError(error);
}
