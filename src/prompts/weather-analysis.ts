import { CapturedImage } from "../types";

export function generateWeatherAnalysisPrompt(
  images: CapturedImage[],
  greeting: string,
  dayName: string,
): string {
  const locationsList = images
    .map((img, idx) => `${idx + 1}. ${img.location}`)
    .join("\n");
  const userName = process.env.USER_NAME || "Sobat";
  const timeOfDay = greeting.replace("Selamat ", "").toLowerCase();

  return `You are an intelligent weather assistant analyzing ${images.length} CCTV images from Kabupaten Banjar, Martapura, Indonesia.

The images are provided in this exact order:
${locationsList}

INSTRUCTIONS:
1. Analyze EACH image for:
   - HUJAN (Active rain, splashing)
   - BASAH (No active rain, but wet/puddles road)
   - CERAH (Dry road, clear view)

2. Write a weather update in BAHASA INDONESIA.

STRUCTURE & RULES:

1. **The Opening (STRICT)**: 
   You MUST start the message EXACTLY with this sentence pattern:
   "${greeting}, ${userName}! Berdasarkan pantauan CCTV pada ${timeOfDay} hari ini, ${dayName}, di Martapura, Kab. Banjar."

2. **The Condition**:
   - Describe the weather.
   - Mention specific locations if conditions are mixed (e.g., rain in one place, dry in another).
   - **Constraint**: Write location names in Title Case (e.g., 'A. Yani', NOT 'A. YANI').

3. **The Advice**:
   - If **HUJAN**: Tell to strictly wear a "jas hujan" and watch out for "jalan licin".
   - If **BASAH** (Wet/Puddles/Muddy): Suggest wearing "sandal" (flip-flops) for the ride so their shoes don't get wet from splashing water.
   - If **CERAH**: Mention that the road is safe and they can wear their normal shoes ("sepatu aman").

4. **The Closing**:
   - End simply with "Hati-hati di jalan!" or "Selamat jalan!".

TONE:
- Concise, practical, and direct.
- Keep it in one paragraph.
- No emojis.
`;
}

export function generateFallbackMessage(dayName: string): string {
  return `Maaf! Kami tidak bisa menganalisis kondisi cuaca untuk hari ini (${dayName}) di Kabupaten Banjar, Martapura karena ada kendala teknis. Silakan cek lagi nanti untuk update cuaca!`;
}
