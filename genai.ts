import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { withRetry, logRetryAttempt } from './retry';

// Load environment variables
dotenv.config();

// Initialize Google GenAI
const apiKey = process.env.GOOGLE_GENAI_API_KEY;
const modelName = process.env.GOOGLE_GENAI_MODEL || 'models/gemini-flash-latest';

if (!apiKey) {
    throw new Error('GOOGLE_GENAI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Get the generative model instance
 */
export function getModel() {
    return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Generate content from text prompt
 */
export async function generateContent(prompt: string): Promise<string> {
    return await withRetry(
        async () => {
            const model = getModel();
            const result = await model.generateContent(prompt);
            const response = result.response;
            return response.text();
        },
        {
            maxRetries: 3,
            initialDelayMs: 120000, // 2 minutes
            backoffMultiplier: 2,
            onRetry: (attempt, error, delayMs) => {
                console.log(`\nAI text generation failed: ${error.message}`);
                logRetryAttempt('generateContent', attempt, 3, error, delayMs);
            },
        }
    );
}

/**
 * Generate content from image and text prompt
 */
export async function analyzeImage(imageBase64: string, prompt: string): Promise<string> {
    return await withRetry(
        async () => {
            const model = getModel();

            const imagePart = {
                inlineData: {
                    data: imageBase64,
                    mimeType: 'image/png',
                },
            };

            const result = await model.generateContent([prompt, imagePart]);
            const response = result.response;
            return response.text();
        },
        {
            maxRetries: 3,
            initialDelayMs: 120000, // 2 minutes
            backoffMultiplier: 2,
            onRetry: (attempt, error, delayMs) => {
                console.log(`\nAI image analysis failed: ${error.message}`);
                logRetryAttempt('analyzeImage', attempt, 3, error, delayMs);
            },
        }
    );
}

/**
 * Analyze multiple images with a single prompt
 */
export async function analyzeMultipleImages(
    images: Array<{ base64: string; location: string }>,
    prompt: string
): Promise<string> {
    return await withRetry(
        async () => {
            const model = getModel();

            const parts: any[] = [prompt];

            // Add all images to the prompt
            images.forEach((img) => {
                parts.push({
                    inlineData: {
                        data: img.base64,
                        mimeType: 'image/png',
                    },
                });
            });

            const result = await model.generateContent(parts);
            const response = result.response;
            return response.text();
        },
        {
            maxRetries: 3,
            initialDelayMs: 120000, // 2 minutes
            backoffMultiplier: 2,
            onRetry: (attempt, error, delayMs) => {
                console.log(`\nAI multi-image analysis failed: ${error.message}`);
                console.log(`This is a critical operation analyzing ${images.length} images`);
                logRetryAttempt('analyzeMultipleImages', attempt, 3, error, delayMs);
            },
        }
    );
}

/**
 * Start a chat session
 */
export function startChat(history?: Array<{ role: string; parts: Array<{ text: string }> }>) {
    const model = getModel();
    return model.startChat({
        history: history || [],
    });
}

export { genAI };
