import { http, HttpResponse } from 'msw';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const handlers = [
  // Mock WhatsApp Webhook
  http.post(ENDPOINTS.whatsappWebhook, async ({ request }) => {
    const data: any = await request.json();
    
    if (!data.text) {
      return new HttpResponse(null, { status: 400 });
    }

    return HttpResponse.json({
      need_id: crypto.randomUUID(),
      status: 'submitted',
    });
  }),

  // Mock Need Created status
  http.get(`${ENDPOINTS.needCreated}/:id`, () => {
    return HttpResponse.json({
      need_id: 'test-id',
      status: 'matching',
      location_text: 'Test Location',
    });
  }),
];
