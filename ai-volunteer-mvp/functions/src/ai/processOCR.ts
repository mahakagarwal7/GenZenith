import vision from '@google-cloud/vision';

export async function extractTextFromImage(imageUri: string): Promise<{ text: string; confidence: number }> {
  if (!imageUri) return { text: '', confidence: 0 };

  const client = new vision.ImageAnnotatorClient();
  const [result] = await client.documentTextDetection(imageUri);
  const fullTextAnnotation = result.fullTextAnnotation;

  if (!fullTextAnnotation?.text) return { text: '', confidence: 0 };

  const text = fullTextAnnotation.text.trim();
  const pageConfidence = fullTextAnnotation.pages?.[0]?.confidence ?? 0;
  return { text, confidence: Math.round(pageConfidence * 100) / 100 };
}
