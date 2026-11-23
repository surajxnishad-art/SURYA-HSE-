import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { GENERATED_DIR } from './db.ts';

const DEFAULT_TEXT_MODEL = process.env.AI_TEXT_MODEL?.trim() || 'gemini-4-hydrogen';
const FALLBACK_TEXT_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_IMAGE_MODEL = process.env.AI_IMAGE_MODEL?.trim() || 'gemini-3.1-flash-lite-image';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new AiServiceError(
      'GEMINI_API_KEY is not configured on the server. Please configure it in Settings > Secrets.',
      'सर्वर पर GEMINI_API_KEY सेट नहीं है। कृपया Settings > Secrets में API कुंजी कॉन्फ़िगर करें।',
      503
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class AiServiceError extends Error {
  hindiMessage: string;
  statusCode: number;

  constructor(message: string, hindiMessage: string, statusCode = 500) {
    super(message);
    this.name = 'AiServiceError';
    this.hindiMessage = hindiMessage;
    this.statusCode = statusCode;
  }
}

function classifyAndFormatAiError(err: unknown): AiServiceError {
  if (err instanceof AiServiceError) return err;

  const rawMsg = err instanceof Error ? err.message : String(err);
  const lower = rawMsg.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('aborted')) {
    return new AiServiceError(
      'AI request timed out. Your form data is preserved—please try again.',
      'AI अनुरोध का समय समाप्त हो गया (Timeout)। आपका डेटा सुरक्षित है—कृपया पुनः प्रयास करें।',
      504
    );
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate')) {
    return new AiServiceError(
      'AI rate limit or quota reached. Please wait a moment or check your billing-enabled API key in Settings > Secrets.',
      'AI उपयोग सीमा (Rate Limit/Quota) समाप्त हो गई है। कृपया कुछ समय बाद प्रयास करें या Settings > Secrets में अपनी API कुंजी जांचें।',
      429
    );
  }
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid') || lower.includes('401')) {
    return new AiServiceError(
      'Gemini API access denied or paid key required for this feature. Please check Settings > Secrets.',
      'Gemini API अनुमति अस्वीकृत या इस सुविधा के लिए पेड API कुंजी आवश्यक है। कृपया Settings > Secrets जांचें।',
      403
    );
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return new AiServiceError(
      'Configured AI model is currently unavailable. Please verify model configuration.',
      'कॉन्फ़िगर किया गया AI मॉडल वर्तमान में उपलब्ध नहीं है। कृपया मॉडल सेटिंग जांचें।',
      404
    );
  }

  return new AiServiceError(
    `AI service error: ${rawMsg}`,
    `AI सेवा में त्रुटि आई है: ${rawMsg}`,
    502
  );
}

async function withTimeoutAndRetry<T>(
  operation: (model: string) => Promise<T>,
  primaryModel: string,
  fallbackModel: string | null,
  timeoutMs = 90000,
  maxRetries = 1
): Promise<{ result: T; modelUsed: string }> {
  const modelsToTry = fallbackModel && fallbackModel !== primaryModel
    ? [primaryModel, fallbackModel]
    : [primaryModel];

  let lastErr: unknown;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          operation(model),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
          ),
        ]);
        return { result, modelUsed: model };
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
        const isTransient =
          msg.includes('429') ||
          msg.includes('503') ||
          msg.includes('timeout') ||
          msg.includes('temporarily') ||
          msg.includes('unavailable');

        if (isTransient && attempt < maxRetries) {
          const delayMs = 800 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        break;
      }
    }
  }

  throw classifyAndFormatAiError(lastErr);
}

export interface ObservationAiInput {
  imageBase64: string;
  mimeType: string;
  location: string;
  agencyName: string;
  jobExecutor: string;
  workActivity: string;
  category: string;
  language: 'English' | 'Hindi' | 'Bilingual';
}

export interface ObservationAiOutput {
  title: string;
  photoSummary: string;
  observationType: 'Unsafe Act' | 'Unsafe Condition' | 'Both' | 'Positive Observation';
  detectedCategory: string;
  hazard: string;
  potentialConsequence: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' | 'Needs Verification';
  correctiveAction: string;
  preventiveAction: string;
  precaution: string;
  responsiblePerson: string;
  siteVerification: string;
  observationEnglish: string;
  hindiExplanation: string;
  modelUsed: string;
}

export async function analyzeSafetyPhoto(input: ObservationAiInput): Promise<ObservationAiOutput> {
  const ai = getAiClient();

  const systemInstruction = `You are a Certified Industrial HSE (Health, Safety, and Environment) Lead Auditor for SURAJ HSE.
CRITICAL EVIDENCE RULES:
1. Analyze ONLY what is visibly present in the uploaded industrial/construction site photograph.
2. NEVER invent, assume, or hallucinate unseen equipment, unseen permits, hidden earthing, invisible gas readings, or unseen injuries.
3. If visibility is blurry, obstructed, or a critical compliance check cannot be confirmed visually (e.g., whether a harness lanyard is anchored, whether LOTO lock is applied, whether PTW is signed), explicitly state "Needs Verification" in riskLevel (if uncertain) or specify exact physical checks needed in siteVerification.
4. Provide professional industrial safety language suitable for steel plants, construction sites, warehouses, power plants, and factories.
5. Always populate both observationEnglish (clear English safety observation) and hindiExplanation (natural, accurate Hindi Devanagari explanation).`;

  const userPrompt = `Analyze this site photograph and generate a structured HSE Safety Observation.
Context provided by observer:
- Location: ${input.location || 'Not specified'}
- Agency / Contractor: ${input.agencyName || 'Not specified'}
- Job Executor: ${input.jobExecutor || 'Not specified'}
- Work Activity: ${input.workActivity || 'Not specified'}
- Selected Category: ${input.category === 'Auto' ? 'Auto-detect from visual evidence' : input.category}
- Preferred Output Focus: ${input.language}

Inspect ONLY visible PPE, housekeeping, scaffolding, electrical panels, lifting gear, barricading, tools, fire equipment, and worker posture visible in the image.`;

  const { result, modelUsed } = await withTimeoutAndRetry(
    async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.imageBase64,
              },
            },
            { text: userPrompt },
          ],
        },
        config: {
          systemInstruction,
          ...(model.startsWith('gemini-4')
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Concise observation headline based strictly on visible evidence' },
              photoSummary: { type: Type.STRING, description: 'Objective description of what is visibly seen in the photo' },
              observationType: {
                type: Type.STRING,
                description: 'Must be one of: Unsafe Act, Unsafe Condition, Both, Positive Observation',
              },
              detectedCategory: { type: Type.STRING, description: 'Safety category such as Work at Height, Electrical Safety, PPE Compliance, Lifting & Crane Safety, Fire Safety, Housekeeping, Scaffolding, Excavation, Welding & Hot Work, Traffic & Forklift Safety, General Industrial Safety' },
              hazard: { type: Type.STRING, description: 'Specific hazard identified from visible evidence' },
              potentialConsequence: { type: Type.STRING, description: 'Potential injury or property damage consequence' },
              riskLevel: {
                type: Type.STRING,
                description: 'Must be one of: Low, Medium, High, Critical, Needs Verification',
              },
              correctiveAction: { type: Type.STRING, description: 'Immediate corrective action required at site' },
              preventiveAction: { type: Type.STRING, description: 'Long-term preventive engineering or administrative control' },
              precaution: { type: Type.STRING, description: 'Mandatory safety precautions and PPE' },
              responsiblePerson: { type: Type.STRING, description: 'Suggested responsible role or job executor' },
              siteVerification: { type: Type.STRING, description: 'Items that require physical site verification because they cannot be confirmed from the photo alone' },
              observationEnglish: { type: Type.STRING, description: 'Complete formal industrial safety observation paragraph in English' },
              hindiExplanation: { type: Type.STRING, description: 'Complete clear safety observation & guidance explanation in Hindi (Devanagari)' },
            },
            required: [
              'title',
              'photoSummary',
              'observationType',
              'detectedCategory',
              'hazard',
              'potentialConsequence',
              'riskLevel',
              'correctiveAction',
              'preventiveAction',
              'precaution',
              'responsiblePerson',
              'siteVerification',
              'observationEnglish',
              'hindiExplanation',
            ],
          },
        },
      });
      return response.text;
    },
    DEFAULT_TEXT_MODEL,
    FALLBACK_TEXT_MODEL
  );

  if (!result) {
    throw new AiServiceError(
      'AI returned an empty observation response.',
      'AI ने कोई विश्लेषण परिणाम नहीं लौटाया। कृपया पुनः प्रयास करें।',
      502
    );
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(result);
  } catch {
    throw new AiServiceError(
      'AI returned malformed structured output.',
      'AI आउटपुट को पार्स करने में समस्या आई। कृपया पुनः प्रयास करें।',
      502
    );
  }

  const validTypes = ['Unsafe Act', 'Unsafe Condition', 'Both', 'Positive Observation'];
  const validRisks = ['Low', 'Medium', 'High', 'Critical', 'Needs Verification'];

  return {
    title: parsed.title || 'Site Safety Observation',
    photoSummary: parsed.photoSummary || '',
    observationType: (validTypes.includes(parsed.observationType)
      ? parsed.observationType
      : 'Unsafe Condition') as ObservationAiOutput['observationType'],
    detectedCategory: parsed.detectedCategory || (input.category === 'Auto' ? 'General Industrial Safety' : input.category),
    hazard: parsed.hazard || 'Needs site verification',
    potentialConsequence: parsed.potentialConsequence || 'Potential workplace injury',
    riskLevel: (validRisks.includes(parsed.riskLevel)
      ? parsed.riskLevel
      : 'Needs Verification') as ObservationAiOutput['riskLevel'],
    correctiveAction: parsed.correctiveAction || '',
    preventiveAction: parsed.preventiveAction || '',
    precaution: parsed.precaution || '',
    responsiblePerson: parsed.responsiblePerson || input.jobExecutor || 'Site Supervisor',
    siteVerification: parsed.siteVerification || 'Verify physical controls and permit compliance on site.',
    observationEnglish: parsed.observationEnglish || '',
    hindiExplanation: parsed.hindiExplanation || '',
    modelUsed,
  };
}

export async function generateSafetyImage(
  prompt: string,
  category: string,
  aspectRatio: '1:1' | '16:9' | '4:3' | '3:4' = '16:9'
): Promise<{ imagePath: string; modelUsed: string }> {
  const ai = getAiClient();
  const enhancedPrompt = `Realistic industrial safety training photograph (${category}): ${prompt}. High-resolution documentary industrial photography, accurate PPE (hard hats, safety glasses, high-visibility vests, gloves, safety harnesses where relevant), realistic industrial plant or construction environment, natural lighting, no cartoon effects.`;

  const { result, modelUsed } = await withTimeoutAndRetry(
    async (model) => {
      return await ai.models.generateContent({
        model,
        contents: {
          parts: [{ text: enhancedPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio,
          },
        },
      });
    },
    DEFAULT_IMAGE_MODEL,
    null,
    60000,
    1
  );

  const parts = result.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType || 'image/png';
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
      const fileName = `ai_hse_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const absPath = path.resolve(GENERATED_DIR, fileName);
      fs.writeFileSync(absPath, Buffer.from(part.inlineData.data, 'base64'));
      return {
        imagePath: `/generated/${fileName}`,
        modelUsed,
      };
    }
  }

  throw new AiServiceError(
    'Image generation API did not return an image asset.',
    'इमेज जनरेशन API से कोई चित्र प्राप्त नहीं हुआ। कृपया प्रॉम्प्ट बदलकर पुनः प्रयास करें।',
    502
  );
}

export interface DocumentAiInput {
  docType: string;
  title: string;
  location: string;
  department: string;
  language: 'English' | 'Hindi' | 'Bilingual';
  contextNotes: string;
}

export interface GeneratedDocContent {
  summary: string;
  summaryHi: string;
  ppeRequired: string[];
  hazardsAndControls: Array<{
    step: string;
    hazard: string;
    risk: string;
    control: string;
    responsibility: string;
  }>;
  verificationChecklist: string[];
  emergencyNotes: string;
}

export async function generateSafetyDocumentContent(
  input: DocumentAiInput
): Promise<{ content: GeneratedDocContent; modelUsed: string }> {
  const ai = getAiClient();

  const systemInstruction = `You are a Principal Industrial EHS Specialist creating formal, compliant industrial safety documentation for SURAJ HSE (ISO 45001 aligned).
Produce practical, thorough, field-ready content with realistic hazards, engineering & administrative controls, PPE, responsibilities, and verification checkpoints.
Language requirement:
- If language is "Hindi", write all narrative fields, hazards, controls, and checklist items in clear Hindi (Devanagari).
- If language is "English", write in crisp technical English (with brief summaryHi if helpful).
- If language is "Bilingual", write crisp English and include Hindi translations/explanations in summaryHi and bilingual key items.`;

  const prompt = `Generate structured content for:
Document Module: ${input.docType}
Document Title: ${input.title}
Site / Location: ${input.location}
Department / Agency: ${input.department}
Language Mode: ${input.language}
Specific Work Scope / Context: ${input.contextNotes || 'Standard industrial plant operations'}`;

  const { result, modelUsed } = await withTimeoutAndRetry(
    async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          ...(model.startsWith('gemini-4')
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              summaryHi: { type: Type.STRING },
              ppeRequired: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              hazardsAndControls: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    hazard: { type: Type.STRING },
                    risk: { type: Type.STRING },
                    control: { type: Type.STRING },
                    responsibility: { type: Type.STRING },
                  },
                  required: ['step', 'hazard', 'risk', 'control', 'responsibility'],
                },
              },
              verificationChecklist: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              emergencyNotes: { type: Type.STRING },
            },
            required: [
              'summary',
              'summaryHi',
              'ppeRequired',
              'hazardsAndControls',
              'verificationChecklist',
              'emergencyNotes',
            ],
          },
        },
      });
      return response.text;
    },
    DEFAULT_TEXT_MODEL,
    FALLBACK_TEXT_MODEL
  );

  if (!result) {
    throw new AiServiceError(
      'AI document generator returned empty content.',
      'AI दस्तावेज़ जनरेटर से कोई सामग्री प्राप्त नहीं हुई।',
      502
    );
  }

  const parsed = JSON.parse(result) as GeneratedDocContent;
  return { content: parsed, modelUsed };
}
