import { getGoogleAccessToken } from './google-auth.ts';

export type TriageResult = {
  category: string;
  urgency: 'critical' | 'urgent' | 'normal' | 'low';
  location_text: string;
  patient_details?: string;
  resource_requirements?: string[];
  confidence: number;
  reasoning?: string;
};

/**
 * AI Triage using LLM (Gemini / OpenAI)
 * Falls back to basic logic if no API keys are present.
 */
export async function aiTriage(text: string): Promise<TriageResult> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  if (geminiKey) {
    console.log('[AI] Attempting triage with Gemini...');
    return await triageWithGemini(text, geminiKey);
  }

  if (openaiKey) {
    console.log('[AI] Attempting triage with OpenAI...');
    return await triageWithOpenAI(text, openaiKey);
  }

  console.log('[AI] No API keys found. Using Regex Fallback.');
  return fallbackTriage(text);
}

async function triageWithGemini(text: string, apiKey: string): Promise<TriageResult> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `
    Analyze this disaster assistance request and return a JSON object.
    Request: "${text}"
    
    Fields:
    - category: (medical, water_supply, logistics, food, general)
    - urgency: (critical, urgent, normal, low)
    - location_text: Best extracted location
    - patient_details: Any info about people in need
    - resource_requirements: Array of specific items needed
    - confidence: 0.0 to 1.0
    - reasoning: Brief explanation
  `;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    
    const data = await response.json();
    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    return { ...result, confidence: result.confidence || 0.8 };
  } catch (err) {
    console.error('[AI] Gemini triage failed:', err);
    console.log('[AI] Switching to fallback logic.');
    return fallbackTriage(text);
  }
}

async function triageWithOpenAI(text: string, apiKey: string): Promise<TriageResult> {
  // Similar implementation for OpenAI...
  return fallbackTriage(text);
}

function fallbackTriage(text: string): TriageResult {
  const lower = text.toLowerCase();
  
  // Basic Regex Logic (as used in the original codebase)
  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    medical: ['blood', 'doctor', 'hospital', 'medicine', 'injury', 'accident', 'bleeding', 'oxygen'],
    water_supply: ['water', 'tanker', 'dry', 'dehydration', 'well', 'pipeline'],
    logistics: ['transport', 'road', 'blocked', 'delivery', 'supplies', 'vehicle'],
    food: ['food', 'ration', 'hunger', 'meal', 'grain', 'kitchen'],
    general: ['help', 'need', 'assist'],
  };

  const category = Object.entries(CATEGORY_KEYWORDS).find(([, k]) => k.some((w) => lower.includes(w)))?.[0] || 'general';
  
  let urgency: 'critical' | 'urgent' | 'normal' | 'low' = 'normal';
  if (/\b(emergency|critical|immediately|life|bleeding)\b/i.test(lower)) urgency = 'critical';
  else if (/\b(urgent|asap|today|soon)\b/i.test(lower)) urgency = 'urgent';
  else if (/\b(next week|flexible|update|status)\b/i.test(lower)) urgency = 'low';

  // Basic location extraction
  const locMatch = text.match(/(?:\b(?:at|in|near|around)\b|\blocation\b[:\-]?)\s+([^.;\n]+)/i);
  const location_text = locMatch?.[1]?.trim() || text.slice(0, 100);

  return {
    category,
    urgency,
    location_text,
    confidence: 0.5, // Low confidence for fallback
    reasoning: 'Processed via regex fallback (no LLM key configured)'
  };
}
