import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { extractTextFromImage } from '../ai/processOCR';
import { classifyMessage } from '../ai/messageClassifier';
import { Need } from '../shared-types';

admin.initializeApp();

export const handleWhatsAppWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const { Body, MediaUrl0, From } = req.body;
  if (!Body && !MediaUrl0) {
    res.status(400).json({ error: 'Missing payload' });
    return;
  }

  try {
    let rawText = Body || '';
    let confidence = 1.0;
    if (MediaUrl0) {
      const ocr = await extractTextFromImage(MediaUrl0);
      rawText = ocr.text;
      confidence = ocr.confidence;
    }

    const classification = classifyMessage(rawText, `msg-${Date.now()}`);
    const status: Need['status'] = confidence < 0.7 ? 'needs_validation' : 'unassigned';

    const needRef = admin.firestore().collection('needs_raw').doc();
    await needRef.set({
      needId: needRef.id,
      source: 'whatsapp',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      location: { geo: null, text: 'pending_geocode' },
      category: classification.category,
      subcategory: 'pending',
      urgency: classification.classification,
      rawText,
      confidence,
      status,
      assignedTo: null,
      ngoId: 'ngo_default_01',
      classification,
      contactNumber: From
    });

    res.status(200).json({ status: 'ok', needId: needRef.id });
  } catch (err) {
    console.error('Ingestion error:', err);
    res.status(500).json({ error: 'Pipeline failed' });
  }
});