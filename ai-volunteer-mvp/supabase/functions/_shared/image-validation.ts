import { getGoogleAccessToken } from './google-auth.ts';

export type ValidationResult = {
  isValid: boolean;
  confidence: number;
  labels: string[];
  description: string;
};

/**
 * Validates if an image matches a certain category (e.g., food, medical)
 */
export async function validateImageContent(imageContent: string, expectedCategory: string): Promise<ValidationResult> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) {
    return { isValid: true, confidence: 0, labels: [], description: 'Verification skipped (no auth)' };
  }

  const endpoint = 'https://vision.googleapis.com/v1/images:annotate';
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageContent },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'SAFE_SEARCH_DETECTION' }
            ],
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Vision API error: ${response.status}`);
    
    const data = await response.json();
    const annotations = data.responses[0].labelAnnotations || [];
    const labels = annotations.map((a: any) => a.description.toLowerCase());
    
    // Check for category-specific keywords
    const categoryKeywords: Record<string, string[]> = {
      food: ['food', 'meal', 'bread', 'rice', 'grocery', 'vegetable', 'fruit', 'package', 'box'],
      medical: ['medicine', 'pill', 'hospital', 'doctor', 'bandage', 'clinic', 'first aid', 'prescription'],
      water_supply: ['water', 'bottle', 'tanker', 'bucket', 'well', 'pump'],
    };

    const keywords = categoryKeywords[expectedCategory] || [];
    const match = labels.some((l: string) => keywords.some(k => l.includes(k)));

    return {
      isValid: match || keywords.length === 0,
      confidence: annotations[0]?.score || 0,
      labels,
      description: match ? `Successfully verified ${expectedCategory}` : `Could not verify ${expectedCategory} in labels: ${labels.slice(0,3).join(', ')}`
    };
  } catch (err) {
    console.error('Image validation failed:', err);
    return { isValid: true, confidence: 0, labels: [], description: 'Verification error fallback' };
  }
}
