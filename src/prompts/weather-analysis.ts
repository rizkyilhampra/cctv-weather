/**
 * AI prompt templates for weather analysis
 */

import { CapturedImage } from '../types';

/**
 * Generate weather analysis prompt for multiple CCTV images
 */
export function generateWeatherAnalysisPrompt(images: CapturedImage[]): string {
  const locationsList = images.map((img, idx) => `${idx + 1}. ${img.location}`).join('\n');

  return `You are analyzing ${images.length} CCTV camera images from different locations in Kabupaten Banjar, Martapura, Indonesia.

The locations are:
${locationsList}

For EACH image, determine the weather/road condition using these categories:

1. RAINING - Active rainfall happening now:
   PRIMARY indicators (most important):
   - Visible rain droplets/streaks falling in the air
   - Heavy rain droplets on camera lens (distorting the view)
   - Very low visibility/foggy/hazy atmosphere
   - Water splashing from moving vehicles

   SECONDARY indicators (less reliable):
   - Dark, overcast sky
   - Note: People may use umbrellas for sun protection even when it's clear, so umbrellas alone are NOT a strong indicator

2. WET - Recently rained, roads are wet/muddy/slippery:
   - Roads are wet, shiny, or reflective
   - Puddles of water visible on roads
   - Wet surfaces on buildings/sidewalks
   - Good visibility (not foggy)
   - Sky may be clearing but ground is still wet
   - No active rainfall visible

3. DRY - Clear, dry conditions:
   - Dry road surfaces (not shiny/reflective)
   - No puddles
   - Clear visibility
   - Bright or normal lighting conditions
   - No signs of recent rain

Now write a casual, friendly weather update message that flows naturally like a conversation.

Start with a greeting that includes today's day of week and location, like:
- "Hey there! Here's your morning weather update for today (Monday) in Kabupaten Banjar, Martapura..."
- "Good morning! Here's what the weather looks like today (Tuesday) for Kabupaten Banjar, Martapura..."
- "Hey! Quick weather check for today (Wednesday) in Kabupaten Banjar, Martapura..."

Then continue with 2-3 sentences describing the current weather conditions. Talk directly to the reader using "you" and "your". Mention specific location names where there's rain, wet/muddy/slippery roads, or dry conditions. End with practical advice about umbrellas and waterproof footwear if needed.

Important:
- Make it flow naturally - integrate the day, location, and greeting together
- NO separate header or title - just write it as a natural paragraph
- Write directly and personally
- Mention specific location names from the list above
- Include practical advice when relevant
- Keep it friendly and conversational throughout`;
}

/**
 * Generate fallback weather message when AI analysis fails
 */
export function generateFallbackMessage(): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = days[new Date().getDay()];

  return `Hey there! Sorry, we're unable to analyze the weather conditions for today (${today}) in Kabupaten Banjar, Martapura due to a technical error. Please check back later for updates!`;
}
