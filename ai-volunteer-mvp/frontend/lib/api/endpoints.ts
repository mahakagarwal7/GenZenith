import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_API_BASE: z.string().url().optional(),
});


export function validateEnv() {
  const raw = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
  };

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment configuration. Check your .env file.");
  }

  // If NEXT_PUBLIC_API_BASE is not provided, derive it from SUPABASE_URL
  const data = result.data;
  if (!data.NEXT_PUBLIC_API_BASE) {
    const supaUrl = data.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/g, "");
    try {
      const urlObj = new URL(supaUrl);
      const host = urlObj.host; // e.g. 'abcxyz.supabase.co' or '127.0.0.1:54321'

      // Production Supabase hosts functions on the functions subdomain (e.g. abcxyz.functions.supabase.co)
      if (host.endsWith(".supabase.co") || host.endsWith(".supabase.in")) {
        const projectRef = host.split(".")[0];
        data.NEXT_PUBLIC_API_BASE = `${urlObj.protocol}//${projectRef}.functions.${host.split('.').slice(1).join('.')}`;
      } else {
        // Fallback: assume supabase CLI/local exposes functions under /functions/v1
        data.NEXT_PUBLIC_API_BASE = `${supaUrl}/functions/v1`;
      }
    } catch (e) {
      // If URL parsing fails, fallback to naive append
      data.NEXT_PUBLIC_API_BASE = `${data.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1`;
    }
  }

  return data;
}

const validatedEnv = validateEnv();

export const env = validatedEnv;
export const getSupabaseUrl = () => validatedEnv.NEXT_PUBLIC_SUPABASE_URL;
export const getSupabaseAnonKey = () => validatedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const ENDPOINTS = {
  whatsappWebhook: `${env.NEXT_PUBLIC_API_BASE}/whatsapp-webhook`,
  volunteerResponse: `${env.NEXT_PUBLIC_API_BASE}/volunteer-response`,
  needCreated: `${env.NEXT_PUBLIC_API_BASE}/need-created`,
} as const;
