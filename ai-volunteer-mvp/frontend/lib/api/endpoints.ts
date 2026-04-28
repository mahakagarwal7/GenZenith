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
    const base = data.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/g, "");
    data.NEXT_PUBLIC_API_BASE = `${base}/functions/v1`;
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
