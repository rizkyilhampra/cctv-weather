// Enable improved file handling behavior
process.env.NTBA_FIX_350 = '1';

import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { withRetry, withRetrySafe, logRetryAttempt } from './retry';

dotenv.config();

export interface CapturedImage {
  location: string;
  base64: string;
}

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

      // Telegram media groups support up to 10 items
      const maxImagesPerGroup = 10;

      for (let i = 0; i < images.length; i += maxImagesPerGroup) {
        const batch = images.slice(i, i + maxImagesPerGroup);

        // Try to send media group with retry
        const result = await withRetrySafe(
          async () => {
            // Convert base64 images to buffers and create media group
            const media: any[] = batch.map((img, index) => {
              const buffer = Buffer.from(img.base64, 'base64');

              return {
                type: 'photo',
                media: buffer,
                fileOptions: {
                  filename: `${img.location.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`,
                  contentType: 'image/jpeg',
                },
                caption: i + index === 0 ? `CCTV Images - ${new Date().toLocaleString()}` : img.location,
              };
            });

            await this.bot!.sendMediaGroup(this.chatId, media);
          },
          {
            maxRetries: 3,
            initialDelayMs: 120000, // 2 minutes
            backoffMultiplier: 2,
            onRetry: (attempt, error, delayMs) => {
              console.log(`\nFailed to send media group (batch ${i / maxImagesPerGroup + 1}): ${error.message}`);
              logRetryAttempt('sendMediaGroup', attempt, 3, error, delayMs);
            },
          }
        );

        // If media group failed after retries, log warning but continue
        if (!result.success) {
          console.warn(`\n⚠️  Failed to send images (batch ${i / maxImagesPerGroup + 1}) after ${result.attempts} attempts`);
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
        if (i + maxImagesPerGroup < images.length) {
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
        maxRetries: 3,
        initialDelayMs: 120000, // 2 minutes
        backoffMultiplier: 2,
        onRetry: (attempt, error, delayMs) => {
          console.log(`\nFailed to send analysis text: ${error.message}`);
          logRetryAttempt('sendMessage (analysis)', attempt, 3, error, delayMs);
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
        maxRetries: 3,
        initialDelayMs: 120000, // 2 minutes
        backoffMultiplier: 2,
        onRetry: (attempt, error, delayMs) => {
          console.log(`\nFailed to send message: ${error.message}`);
          logRetryAttempt('sendMessage', attempt, 3, error, delayMs);
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
        maxRetries: 2, // Fewer retries for error notifications
        initialDelayMs: 60000, // 1 minute for error notifications
        backoffMultiplier: 2,
        onRetry: (attempt, error, delayMs) => {
          console.log(`\nFailed to send error notification: ${error.message}`);
          logRetryAttempt('sendError', attempt, 2, error, delayMs);
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
    const logDir = 'logs';
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
