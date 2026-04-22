import { randomUUID } from 'crypto';
import { extractTextFromImage } from '../ai/processOCR';
import { classifyMessage } from '../ai/messageClassifier';
import { geocodeLocation } from '../location/geocodeService';
import { supabase } from '../lib/supabaseClient';
import { uploadNeedImage } from '../lib/supabaseStorage';
import type { HttpRequest, HttpResponse } from '../lib/httpTypes';
import { Need } from '../shared-types';

const DEFAULT_NGO_ID = process.env.DEFAULT_NGO_ID;

function extractLocationText(rawText: string): string {
  const normalizedText = rawText.replace(/\s+/g, ' ').trim();
  const match = normalizedText.match(/(?:\b(?:at|in|near|around)\b|\blocation\b[:\-]?)\s+([^.,;\n]+)/i);

  if (match?.[1]) {
    return match[1].trim();
  }

  return normalizedText;
}

function toPostgisPoint(geo: { lat: number; lng: number } | null): string | null {
  if (!geo) {
    return null;
  }

  return `SRID=4326;POINT(${geo.lng} ${geo.lat})`;
}

function getSupabaseErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const err = error as { code?: string; message?: string; details?: string };
    return [err.code, err.message, err.details].filter(Boolean).join(' | ');
  }

  return String(error);
}

function isConstraintViolation(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: string }).code;
    return code === '23505' || code === '23502' || code === '23503' || code === '23514';
  }

  return false;
}

export async function handleWhatsAppWebhook(req: HttpRequest, res: HttpResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const { Body, MediaUrl0, From } = (req.body || {}) as Record<string, string | undefined>;
  if (!Body && !MediaUrl0) {
    res.status(400).json({ error: 'Missing payload' });
    return;
  }

  try {
    if (!DEFAULT_NGO_ID) {
      res.status(500).json({ error: 'Missing DEFAULT_NGO_ID configuration' });
      return;
    }

    let rawText = Body || '';
    let confidence = 1.0;
    const needId = randomUUID();

    if (MediaUrl0) {
      let ocrSource = MediaUrl0;

      if (/^https?:\/\//i.test(MediaUrl0)) {
        try {
          const mediaResponse = await fetch(MediaUrl0);
          if (!mediaResponse.ok) {
            throw new Error(`Media fetch failed with status ${mediaResponse.status}`);
          }

          const arrayBuffer = await mediaResponse.arrayBuffer();
          const contentType = mediaResponse.headers.get('content-type') || 'image/jpeg';
          const uploadedUrl = await uploadNeedImage(needId, Buffer.from(arrayBuffer), contentType);
          ocrSource = uploadedUrl;
        } catch {
          console.error('Media upload to Supabase Storage failed, falling back to source URL for OCR.');
        }
      }

      const ocr = await extractTextFromImage(ocrSource);
      rawText = ocr.text;
      confidence = ocr.confidence;
    }

    const classification = classifyMessage(rawText, `msg-${Date.now()}`);
    const locationText = extractLocationText(rawText);
    const geo = await geocodeLocation(locationText);
    const status: Need['status'] = !geo || confidence < 0.7 ? 'needs_validation' : 'unassigned';
    const { data, error } = await supabase
      .from('needs')
      .insert({
        need_id: needId,
        source: 'whatsapp',
        submitted_at: new Date().toISOString(),
        location_geo: toPostgisPoint(geo),
        location_text: locationText,
        category: classification.category,
        subcategory: 'pending',
        urgency: classification.classification,
        raw_text: rawText,
        confidence,
        status,
        assigned_to: null,
        ngo_id: DEFAULT_NGO_ID,
        contact_number: From || null
      })
      .select('need_id')
      .single();

    if (error) {
      throw error;
    }

    const newNeedId = data?.need_id || needId;

    res.status(200).json({ status: 'ok', needId: newNeedId });
  } catch (err) {
    const errorMessage = getSupabaseErrorMessage(err);

    if (isConstraintViolation(err)) {
      console.error('Supabase constraint violation while saving need:', errorMessage);
      res.status(409).json({ error: 'Database constraint violation' });
      return;
    }

    console.error('Supabase ingestion error:', errorMessage);
    res.status(500).json({ error: 'Pipeline failed' });
  }
}