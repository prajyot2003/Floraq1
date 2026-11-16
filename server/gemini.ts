import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

export const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface PlantDiagnosisResult {
  overall_health: 'healthy' | 'mild_stress' | 'moderate_symptoms' | 'severe_alert' | 'inconclusive';
  confidence_score: number;
  image_quality_check: {
    suitable_for_diagnosis: boolean;
    issues_detected?: string[];
  };
  visible_symptoms: Array<{
    symptom: string;
    region: string;
    severity: 'mild' | 'moderate' | 'severe';
    description: string;
  }>;
  possible_conditions: Array<{
    condition_name: string;
    classification: 'visible_symptom' | 'possible_disease' | 'environmental_stress';
    probability_level: 'low' | 'moderate' | 'high';
    rationale: string;
    is_confirmed_diagnosis: false;
  }>;
  growth_estimates?: {
    canopy_coverage_percent?: number;
    estimated_leaf_count?: number;
    visible_vigor_rating?: number;
    calibration_note: string;
  };
  conservative_recommendations: string[];
  suggested_follow_up: string;
  scientific_disclaimer: string;
}

export async function analyzePlantImage(
  imageDataUrl: string,
  species: string,
  environmentalContext?: {
    temperature?: number;
    humidity?: number;
    soil_moisture?: number;
    light_intensity?: number;
  }
): Promise<PlantDiagnosisResult> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please attach an API key in AI Studio Secrets.');
  }

  // Validate and extract supported raster image bytes for Gemini Vision
  const supportedRasterMimes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ]);

  let rasterMimeType: string | null = null;
  let rasterBase64Data: string | null = null;
  let svgTextContext: string | null = null;

  const trimmedUrl = (imageDataUrl || '').trim();
  const base64Match = trimmedUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);

  if (base64Match) {
    let rawMime = base64Match[1].toLowerCase();
    if (rawMime === 'image/jpg') rawMime = 'image/jpeg';
    const cleanBase64 = base64Match[2].replace(/\s+/g, '');

    if (supportedRasterMimes.has(rawMime)) {
      const buf = Buffer.from(cleanBase64, 'base64');
      if (buf.length > 16) {
        rasterMimeType = rawMime;
        rasterBase64Data = cleanBase64;
      }
    } else if (rawMime === 'image/svg+xml') {
      svgTextContext = Buffer.from(cleanBase64, 'base64').toString('utf-8');
    }
  } else if (trimmedUrl.startsWith('data:image/svg+xml')) {
    const commaIdx = trimmedUrl.indexOf(',');
    if (commaIdx !== -1) {
      try {
        svgTextContext = decodeURIComponent(trimmedUrl.slice(commaIdx + 1));
      } catch {
        svgTextContext = trimmedUrl.slice(commaIdx + 1);
      }
    }
  } else if (/^[A-Za-z0-9+/=]{32,}$/.test(trimmedUrl)) {
    const buf = Buffer.from(trimmedUrl, 'base64');
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      rasterMimeType = 'image/png';
      rasterBase64Data = trimmedUrl;
    } else if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      rasterMimeType = 'image/jpeg';
      rasterBase64Data = trimmedUrl;
    }
  }

  if (!rasterMimeType && !svgTextContext) {
    throw new Error(
      'Invalid or unsupported image format. Capture or upload a valid JPEG, PNG, or WebP plant photograph.'
    );
  }

  const promptText = `
You are the FloraQ Botanical AI Diagnostics Engine operating inside an Autonomous Plant Trainer Chamber.
Plant Species under observation: "${species}".
Current chamber environmental sensor telemetry:
- Temperature: ${environmentalContext?.temperature ?? 'Not measured'} °C
- Relative Humidity: ${environmentalContext?.humidity ?? 'Not measured'} %
- Soil Moisture: ${environmentalContext?.soil_moisture ?? 'Not measured'} %
- Light Intensity: ${environmentalContext?.light_intensity ?? 'Not measured'} lux
${
  svgTextContext && !rasterBase64Data
    ? `\nNote: The stored sample asset is a vector SVG chamber preview rather than a live raster camera photograph. Set image_quality_check.suitable_for_diagnosis to false, explain that a real Raspberry Pi camera JPEG/PNG is required for pathology assessment, and summarize telemetry + schematic context conservatively.\nSVG Preview Excerpt:\n${svgTextContext.slice(0, 2000)}\n`
    : ''
}
Strict scientific protocols:
1. Distinguish between:
   a. "visible_symptom" (purely what is visually observable: leaf curling, yellowing margins, necrotic spots, wilting, powdery residue).
   b. "possible_disease" (fungal, bacterial, viral, or nutrient deficiency candidate).
   c. Never claim this is a confirmed diagnosis. Always set "is_confirmed_diagnosis": false.
2. If the image is blurry, too dark, out of focus, a vector schematic, or does not clearly show plant tissue, explicitly flag suitable_for_diagnosis: false and mark overall_health as "inconclusive".
3. Provide conservative observations only. NEVER prescribe chemical pesticides, fungicides, or hazardous fertilizer overdosing solely from image evidence.
4. Provide estimated canopy coverage percent, visible leaf count, and vigor score with a clear calibration disclaimer noting that 2D cameras lack depth triangulation without physical reference rulers.
`.trim();

  const requestParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
  if (rasterMimeType && rasterBase64Data) {
    requestParts.push({
      inlineData: {
        mimeType: rasterMimeType,
        data: rasterBase64Data,
      },
    });
  }
  requestParts.push({ text: promptText });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: requestParts,
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overall_health: {
              type: Type.STRING,
              description: 'One of healthy, mild_stress, moderate_symptoms, severe_alert, inconclusive',
            },
            confidence_score: {
              type: Type.NUMBER,
              description: 'Confidence between 0.0 and 1.0',
            },
            image_quality_check: {
              type: Type.OBJECT,
              properties: {
                suitable_for_diagnosis: { type: Type.BOOLEAN },
                issues_detected: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['suitable_for_diagnosis'],
            },
            visible_symptoms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  symptom: { type: Type.STRING },
                  region: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ['symptom', 'region', 'severity', 'description'],
              },
            },
            possible_conditions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  condition_name: { type: Type.STRING },
                  classification: { type: Type.STRING },
                  probability_level: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                  is_confirmed_diagnosis: { type: Type.BOOLEAN },
                },
                required: ['condition_name', 'classification', 'probability_level', 'rationale', 'is_confirmed_diagnosis'],
              },
            },
            growth_estimates: {
              type: Type.OBJECT,
              properties: {
                canopy_coverage_percent: { type: Type.NUMBER },
                estimated_leaf_count: { type: Type.INTEGER },
                visible_vigor_rating: { type: Type.NUMBER },
                calibration_note: { type: Type.STRING },
              },
              required: ['calibration_note'],
            },
            conservative_recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            suggested_follow_up: { type: Type.STRING },
            scientific_disclaimer: { type: Type.STRING },
          },
          required: [
            'overall_health',
            'confidence_score',
            'image_quality_check',
            'visible_symptoms',
            'possible_conditions',
            'conservative_recommendations',
            'suggested_follow_up',
            'scientific_disclaimer',
          ],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty diagnosis response.');
    }

    const parsed = JSON.parse(text) as PlantDiagnosisResult;
    // Enforce disclaimer and unconfirmed diagnosis
    parsed.possible_conditions = (parsed.possible_conditions || []).map((c) => ({
      ...c,
      is_confirmed_diagnosis: false,
    }));
    if (!parsed.scientific_disclaimer) {
      parsed.scientific_disclaimer =
        'FloraQ AI plant health observations represent visual symptom assessments and are not certified plant pathology diagnoses. Inspect leaves physically prior to altering chemical regimes.';
    }

    return parsed;
  } catch (err: unknown) {
    console.error('[FloraQ Gemini AI] Analysis failed:', err);
    throw err;
  }
}

export async function generateGrowthScenarioVisualization(
  species: string,
  scenarioPrompt: string,
  currentStage: string
): Promise<{
  visualization_label: string;
  scenario_description: string;
  projected_parameters: Record<string, string>;
  svg_data_url: string;
}> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for growth scenario synthesis.');
  }

  const prompt = `
You are the FloraQ Botanical Predictive Modeling Engine.
Plant species: "${species}". Current stage: "${currentStage}".
Hypothetical Growth Scenario Goal: "${scenarioPrompt}".

Generate a scientific future growth projection and a clean SVG illustration representing this hypothetical trained structure.
Output pure JSON with:
1. "scenario_description": Detailed scientific explanation of projected stem elongation, leaf nodes, branching angle, and canopy structure.
2. "projected_parameters": Key projected values (e.g., "estimated_height_cm", "canopy_diameter_cm", "projected_nodes", "optimal_vpd_kpa").
3. "svg_markup": A complete, valid, beautifully styled SVG XML string (<svg ... viewBox="0 0 800 600" ... </svg>) illustrating the hypothetical plant in the FloraQ dark-green background chamber with clean botanical lines and labeled nodes.
`.trim();

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenario_description: { type: Type.STRING },
          projected_parameters: {
            type: Type.OBJECT,
            properties: {
              estimated_height_cm: { type: Type.STRING },
              canopy_diameter_cm: { type: Type.STRING },
              projected_nodes: { type: Type.STRING },
              optimal_vpd_kpa: { type: Type.STRING },
            },
            required: ['estimated_height_cm', 'canopy_diameter_cm'],
          },
          svg_markup: { type: Type.STRING },
        },
        required: ['scenario_description', 'projected_parameters', 'svg_markup'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  let svg = parsed.svg_markup || '';
  if (!svg.includes('<svg')) {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><rect width="800" height="600" fill="#142B20"/><text x="100" y="300" fill="#DCEFE2" font-size="20">FloraQ Projected Canopy Model</text></svg>`;
  }
  const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return {
    visualization_label: 'AI-generated visualization',
    scenario_description: parsed.scenario_description,
    projected_parameters: parsed.projected_parameters,
    svg_data_url: svgDataUrl,
  };
}
