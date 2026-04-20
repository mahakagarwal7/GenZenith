import { MessageClassification } from '../shared-types';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  medical: ['blood', 'doctor', 'hospital', 'medicine', 'injury', 'accident', 'bleeding'],
  water_supply: ['water', 'tanker', 'dry', 'dehydration', 'well', 'pipeline'],
  logistics: ['transport', 'road', 'blocked', 'delivery', 'supplies', 'vehicle'],
  food: ['food', 'ration', 'hunger', 'meal', 'grain', 'kitchen']
};

export function classifyMessage(text: string, message_id: string): MessageClassification {
  const lower = text.toLowerCase();
  const isCritical = /\b(emergency|critical|immediately|life|bleeding)\b/i.test(lower);
  
  const category = Object.entries(CATEGORY_KEYWORDS).find(([, k]) => k.some(w => lower.includes(w)))?.[0] || 'general';

  let classification: MessageClassification['classification'] = 'normal';
  if (isCritical) classification = 'critical';
  else if (/\b(urgent|asap|today|soon)\b/i.test(lower)) classification = 'urgent';
  else if (/\b(next week|flexible|update|status)\b/i.test(lower)) classification = 'low';

  const confidence = isCritical || category !== 'general' ? 0.92 : 0.65;
  const sla = classification === 'critical' ? 15 : classification === 'urgent' ? 30 : 60;

  return {
    message_id,
    classification,
    category,
    confidence,
    routing: {
      immediate_action: classification === 'critical',
      notification_targets: classification === 'critical' ? ['ngo_supervisor', 'nearby_medical_volunteers'] : ['standard_queue'],
      sla_minutes: sla
    },
    duplicate_check: { is_duplicate: false, similar_requests: [] }
  };
}