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
1. **Analyze EACH image carefully** using this multi-step process:

   STEP 1 - INTERNAL ASSESSMENT (DO NOT include this in your response):
   For each location, assess ONLY the main drivable area (center lanes where vehicles actually drive):
   - What percentage (0-100%) of the DRIVABLE AREA (NOT road edges/curbs) has standing water/puddles?
   - Are there active rain splashes or just residual dampness?
   - Where is the water located: center of road (matters) vs edges/curbs (ignore)?
   - Confidence level: How certain are you about the wetness?

   CRITICAL: IGNORE puddles at road edges, curbs, or gutters. Only assess the CENTER/MAIN DRIVING LANES.

   STEP 2 - CLASSIFICATION (Use these STRICT thresholds):
   - **RAINING (HUJAN)**: Active rain visible (falling rain, splashing droplets, heavy spray from vehicles)

   - **WET (BASAH)**: ≥80% of the DRIVABLE CENTER AREA has standing water/puddles
     * Must see: Large puddles in the CENTER driving lanes that vehicles would drive through
     * Water depth enough to cause splashing when vehicles pass
     * NOT WET: Edge puddles, small wet patches, damp surfaces, reflective roads without depth

   - **DRY (CERAH)**: <20% wetness in drivable area (road is mostly dry)
     * Road is safe to drive on with normal shoes
     * May have: edge puddles (ignore these!), dried rain marks, minor damp patches
     * As long as the MAIN DRIVING PATH is dry → classify as DRY

   CRITICAL RULES - BE CONSERVATIVE:
   - **When in doubt, call it DRY (CERAH)**
   - Small puddles at road edges = IGNORE, still DRY
   - Damp patches without actual standing water = DRY
   - Dried rain marks = DRY
   - Only call it WET if there's significant standing water IN THE CENTER LANES that would ACTUALLY splash shoes/pants

   STEP 3 - AGGREGATE ASSESSMENT:
   After classifying each location individually:
   - Count how many locations are WET vs DRY
   - Calculate: Is WET count > 50% of total locations?
   - The MAJORITY condition wins for your overall advice

2. Write a weather update in BAHASA INDONESIA based on your classification.

STRUCTURE & RULES:

1. **The Opening (STRICT)**:
   You MUST start the message EXACTLY with this sentence pattern:
   "${greeting}, ${userName}! Berdasarkan pantauan CCTV pada ${timeOfDay} hari ini, ${dayName}, di Martapura, Kab. Banjar."

2. **The Condition**:
   - Describe the weather based on your aggregate assessment.
   - If conditions are MIXED (some wet, some dry): Mention specific locations and their individual conditions.
   - If most/all are the SAME: Just describe the overall condition without listing each location.
   - **Constraint**: Write location names in Title Case (e.g., 'A. Yani', NOT 'A. YANI').

3. **The Advice** (Based on AGGREGATE assessment - majority wins):
   - If **RAINING (HUJAN)**: Tell to strictly wear a "jas hujan" and watch out for "jalan licin".
   - If **MAJORITY WET (BASAH)** (>50% of locations have ≥80% center-lane standing water): Suggest wearing "sandal" (flip-flops) for the ride so their shoes don't get wet from splashing water.
   - If **MAJORITY DRY (CERAH)** (>50% of locations are dry/mostly dry): Mention that the road is safe/dry and they can wear their normal shoes ("jalan kering" or "jalanan aman").

4. **The Closing**:
   - End simply with "Hati-hati di jalan!" or "Selamat jalan!".

TONE:
- Concise, practical, and direct.
- Keep it in one paragraph.
- No emojis.
- No Em dash.
`;
}

export function generateFallbackMessage(dayName: string): string {
  return `Maaf! Kami tidak bisa menganalisis kondisi cuaca untuk hari ini (${dayName}) di Kabupaten Banjar, Martapura karena ada kendala teknis. Silakan cek lagi nanti untuk update cuaca!`;
}
