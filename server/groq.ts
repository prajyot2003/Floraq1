import dotenv from 'dotenv';

dotenv.config();

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';

export const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL?.trim() || 'qwen/qwen3.8-27b';
export const GROQ_TEXT_MODEL =
  process.env.GROQ_TEXT_MODEL?.trim() || 'openai/gpt-oss-120b';

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

interface GroqModelEntry {
  id: string;
  active?: boolean;
  owned_by?: string;
  context_window?: number;
  input_modalities?: string[];
  output_modalities?: string[];
}

function getGroqApiKey(): string {
  return (process.env.GROQ_API_KEY || '').trim();
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = (raw || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error('Groq did not return valid JSON.');
  }
}

export async function listAvailableGroqModels(): Promise<GroqModelEntry[]> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY is not configured on the server. Add GROQ_API_KEY in AI Studio Secrets or .env.'
    );
  }

  const res = await fetch(GROQ_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // ignore
    }
    throw new Error(`Failed to list Groq models (${res.status}): ${detail}`);
  }

  const body = (await res.json()) as { data?: GroqModelEntry[] };
  return (body.data || []).filter((m) => m.active !== false);
}

function isAudioOrGuardModel(id: string): boolean {
  const lower = id.toLowerCase();
  return (
    lower.includes('whisper') ||
    lower.includes('guard') ||
    lower.includes('safeguard') ||
    lower.includes('tts') ||
    lower.includes('orpheus') ||
    lower.includes('playai')
  );
}

function isVisionCapableModel(model: GroqModelEntry): boolean {
  if (Array.isArray(model.input_modalities) && model.input_modalities.includes('image')) {
    return true;
  }
  const lower = model.id.toLowerCase();
  return (
    lower.includes('qwen3.8') ||
    lower.includes('llama-4') ||
    lower.includes('vision') ||
    lower.includes('pixtral') ||
    lower.includes('qwen2.5-vl') ||
    lower.includes('qwen-vl')
  );
}

async function resolveCandidateModels(mode: 'vision' | 'text'): Promise<string[]> {
  const preferredVision = [
    process.env.GROQ_VISION_MODEL?.trim(),
    'qwen/qwen3.8-27b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
  ].filter(Boolean) as string[];

  const preferredText = [
    process.env.GROQ_TEXT_MODEL?.trim(),
    'openai/gpt-oss-120b',
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ].filter(Boolean) as string[];

  try {
    const models = await listAvailableGroqModels();
    const usable = models.filter((m) => !isAudioOrGuardModel(m.id));
    const availableIds = usable.map((m) => m.id);

    if (mode === 'vision') {
      const visionAvailable = usable.filter(isVisionCapableModel).map((m) => m.id);
      const ordered = [
        ...preferredVision.filter((id) => visionAvailable.includes(id)),
        ...visionAvailable.filter((id) => !preferredVision.includes(id)),
      ];
      return ordered;
    }

    const orderedText = [
      ...preferredText.filter((id) => availableIds.includes(id)),
      ...availableIds.filter((id) => !preferredText.includes(id)),
    ];
    return orderedText;
  } catch {
    return mode === 'vision' ? preferredVision : preferredText;
  }
}

async function callGroqWithModelFallback(
  mode: 'vision' | 'text',
  buildPayload: (model: string) => Record<string, unknown>
): Promise<{ content: string; model: string }> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY is not configured on the server. Please add GROQ_API_KEY in AI Studio Secrets or your .env file.'
    );
  }

  const candidates = await resolveCandidateModels(mode);
  if (candidates.length === 0) {
    const allModels = await listAvailableGroqModels().catch(() => []);
    const names = allModels.map((m) => m.id).join(', ') || 'none';
    throw new Error(
      `No compatible Groq ${mode} model is enabled on your API key. Available models on your key: ${names}.`
    );
  }

  let lastError: Error | null = null;
  for (const model of candidates) {
    const payload = buildPayload(model);
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        lastError = new Error(`Groq model "${model}" returned an empty response.`);
        continue;
      }
      return { content, model };
    }

    let errDetail = `Groq API HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) {
        errDetail = `Groq API Error (${response.status}): ${errBody.error.message}`;
      }
    } catch {
      // ignore non-JSON body
    }

    lastError = new Error(errDetail);
    // Retry next candidate only when model is unavailable/unsupported or json_object unsupported
    if (response.status === 404 || response.status === 400) {
      continue;
    }
    throw lastError;
  }

  throw lastError || new Error(`All Groq ${mode} model attempts failed.`);
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
): Promise<PlantDiagnosisResult & { model_used?: string }> {
  const supportedRasterMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
   b. "possible_disease" (fungal, bacterial, viral, or nutrient deficiency candidate) or "environmental_stress".
   c. Never claim this is a confirmed diagnosis. Always set "is_confirmed_diagnosis": false.
2. If the image is blurry, too dark, out of focus, a vector schematic, or does not clearly show plant tissue, explicitly flag suitable_for_diagnosis: false and mark overall_health as "inconclusive".
3. Provide conservative observations only. NEVER prescribe chemical pesticides, fungicides, or hazardous fertilizer overdosing solely from image evidence.
4. Provide estimated canopy coverage percent, visible leaf count, and vigor score with a clear calibration disclaimer noting that 2D cameras lack depth triangulation without physical reference rulers.

Respond ONLY with a single valid JSON object matching this exact schema:
{
  "overall_health": "healthy" | "mild_stress" | "moderate_symptoms" | "severe_alert" | "inconclusive",
  "confidence_score": number (0.0 to 1.0),
  "image_quality_check": {
    "suitable_for_diagnosis": boolean,
    "issues_detected": string[]
  },
  "visible_symptoms": [
    {
      "symptom": string,
      "region": string,
      "severity": "mild" | "moderate" | "severe",
      "description": string
    }
  ],
  "possible_conditions": [
    {
      "condition_name": string,
      "classification": "visible_symptom" | "possible_disease" | "environmental_stress",
      "probability_level": "low" | "moderate" | "high",
      "rationale": string,
      "is_confirmed_diagnosis": false
    }
  ],
  "growth_estimates": {
    "canopy_coverage_percent": number,
    "estimated_leaf_count": number,
    "visible_vigor_rating": number,
    "calibration_note": string
  },
  "conservative_recommendations": string[],
  "suggested_follow_up": string,
  "scientific_disclaimer": string
}
`.trim();

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: promptText }];

  const hasRaster = Boolean(rasterMimeType && rasterBase64Data);
  if (hasRaster) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${rasterMimeType};base64,${rasterBase64Data}`,
      },
    });
  }

  try {
    const mode = hasRaster ? 'vision' : 'text';
    const { content, model } = await callGroqWithModelFallback(mode, (candidateModel) => ({
      model: candidateModel,
      messages: [
        {
          role: 'system',
          content:
            'You are a scientific plant pathology and horticulture diagnostics assistant. Always output strict valid JSON.',
        },
        {
          role: 'user',
          content: hasRaster ? userContent : promptText,
        },
      ],
      temperature: 0.2,
      max_completion_tokens: 2048,
      response_format: { type: 'json_object' },
    }));

    const parsed = extractJsonObject(content) as unknown as PlantDiagnosisResult;

    const validHealth = new Set([
      'healthy',
      'mild_stress',
      'moderate_symptoms',
      'severe_alert',
      'inconclusive',
    ]);
    if (!validHealth.has(parsed.overall_health)) {
      parsed.overall_health = 'inconclusive';
    }
    parsed.confidence_score = Math.max(0, Math.min(1, Number(parsed.confidence_score) || 0.5));
    parsed.image_quality_check = parsed.image_quality_check || {
      suitable_for_diagnosis: hasRaster,
      issues_detected: [],
    };
    parsed.visible_symptoms = Array.isArray(parsed.visible_symptoms) ? parsed.visible_symptoms : [];
    parsed.possible_conditions = (Array.isArray(parsed.possible_conditions) ? parsed.possible_conditions : []).map(
      (c) => ({
        ...c,
        is_confirmed_diagnosis: false,
      })
    );
    parsed.conservative_recommendations = Array.isArray(parsed.conservative_recommendations)
      ? parsed.conservative_recommendations
      : ['Inspect plant tissue manually before adjusting irrigation or nutrient dosing.'];
    parsed.suggested_follow_up =
      parsed.suggested_follow_up || 'Re-capture a well-lit macro image in 24 hours to monitor changes.';
    if (!parsed.scientific_disclaimer) {
      parsed.scientific_disclaimer =
        'FloraQ AI plant health observations represent visual symptom assessments and are not certified plant pathology diagnoses. Inspect leaves physically prior to altering chemical regimes.';
    }

    return { ...parsed, model_used: model };
  } catch (err: unknown) {
    console.error('[FloraQ Groq AI] Analysis failed:', err);
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
  model_used?: string;
}> {
  const prompt = `
You are the FloraQ Botanical Predictive Modeling Engine.
Plant species: "${species}". Current stage: "${currentStage}".
Hypothetical Growth Scenario Goal: "${scenarioPrompt}".

Generate a scientific future growth projection and a clean SVG illustration representing this hypothetical trained structure.
Respond ONLY with a valid JSON object containing:
1. "scenario_description": string — Detailed scientific explanation of projected stem elongation, leaf nodes, branching angle, and canopy structure.
2. "projected_parameters": object with string fields:
   - "estimated_height_cm"
   - "canopy_diameter_cm"
   - "projected_nodes"
   - "optimal_vpd_kpa"
3. "svg_markup": string — A complete, valid, cleanly styled SVG XML string (<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">...</svg>) illustrating the hypothetical plant in a dark-green (#142B20) chamber background with clean botanical lines (#4EA87A, #DCEFE2) and labeled nodes.
`.trim();

  try {
    const { content, model } = await callGroqWithModelFallback('text', (candidateModel) => ({
      model: candidateModel,
      messages: [
        {
          role: 'system',
          content: 'You are a botanical canopy modeling engine. Always output strict valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.4,
      max_completion_tokens: 3000,
      response_format: { type: 'json_object' },
    }));

    const parsed = extractJsonObject(content) as {
      scenario_description?: string;
      projected_parameters?: Record<string, string>;
      svg_markup?: string;
    };

    let svg = parsed.svg_markup || '';
    if (!svg.includes('<svg')) {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"><rect width="800" height="600" fill="#142B20"/><text x="100" y="300" fill="#DCEFE2" font-size="20">FloraQ Projected Canopy Model</text></svg>`;
    }
    const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

    return {
      visualization_label: 'AI-generated visualization',
      scenario_description:
        parsed.scenario_description || 'Projected canopy geometry generated for training scenario.',
      projected_parameters: parsed.projected_parameters || {
        estimated_height_cm: '45 cm',
        canopy_diameter_cm: '38 cm',
      },
      svg_data_url: svgDataUrl,
      model_used: model,
    };
  } catch (err: unknown) {
    console.error('[FloraQ Groq AI] Growth visualization failed:', err);
    throw err;
  }
}
