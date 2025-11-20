import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

    try {
      console.log(`Sending weather report to Telegram channel ${this.chatId}...`);

      // Send the analysis text first
      await this.bot.sendMessage(this.chatId, analysis, {
        parse_mode: 'Markdown',
      });

      // If there are images, send them as a media group
      if (images.length > 0) {
        console.log(`Sending ${images.length} images to Telegram...`);

        // Telegram media groups support up to 10 items
        const maxImagesPerGroup = 10;

        for (let i = 0; i < images.length; i += maxImagesPerGroup) {
          const batch = images.slice(i, i + maxImagesPerGroup);

          // Convert base64 images to buffers and create media group
          const media: any[] = batch.map((img, index) => {
            const buffer = Buffer.from(img.base64, 'base64');

            return {
              type: 'photo',
              media: buffer,
              caption: i + index === 0 ? `CCTV Images - ${new Date().toLocaleString()}` : img.location,
            };
          });

          // Send media group
          await this.bot.sendMediaGroup(this.chatId, media);

          // Small delay between batches to avoid rate limiting
          if (i + maxImagesPerGroup < images.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      console.log('Weather report sent successfully to Telegram!');
    } catch (error) {
      console.error('Error sending to Telegram:', error);
      throw error;
    }
  }

  /**
   * Send a simple text message to the channel
   */
  async sendMessage(message: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot is not initialized');
    }

    try {
      await this.bot.sendMessage(this.chatId, message);
      console.log('Message sent to Telegram successfully');
    } catch (error) {
      console.error('Error sending message to Telegram:', error);
      throw error;
    }
  }

  /**
   * Send an error notification to the channel
   */
  async sendError(error: Error): Promise<void> {
    const errorMessage = `⚠️ *Error in Weather Analysis*\n\n\`\`\`\n${error.message}\n\`\`\``;

    try {
      await this.sendMessage(errorMessage);
    } catch (sendError) {
      console.error('Failed to send error notification to Telegram:', sendError);
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
