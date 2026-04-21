import * as functions from 'firebase-functions';

export async function geocodeLocation(text: string): Promise<{ lat: number; lng: number } | null> {
  if (!text.trim()) {
    return null;
  }

  const config = typeof functions.config === 'function' ? functions.config() : {};
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_APIKEY ||
    (config as any)?.googlemaps?.key ||
    (config as any)?.googlemaps?.api_key;

  if (!apiKey) {
    console.error('Google Maps API key is not configured.');
    return null;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Google Maps Geocoding API request failed with status ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
      status?: string;
    };

    if (data.status !== 'OK') {
      return null;
    }

    const result = data.results?.[0];
    const location = result?.geometry?.location;

    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return null;
    }

    return {
      lat: location.lat,
      lng: location.lng,
    };
  } catch (error) {
    console.error('Failed to geocode location:', error);
    return null;
  }
}
