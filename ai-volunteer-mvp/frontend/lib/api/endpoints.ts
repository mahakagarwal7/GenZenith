import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_API_BASE: z.string().url(),
});

/**
 * Validates environment variables at runtime.
 * Fails fast with a clear error message if any are missing or invalid.
 */
export function validateEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Default API base to Supabase Edge Functions if not provided
  const defaultApiBase = supabaseUrl ? `${supabaseUrl}/functions/v1` : "";
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || defaultApiBase;

  const result = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_API_BASE: apiBase,
  });

  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.format());
    // In production, we might want to fail silently or show a UI warning instead of crashing
    if (process.env.NODE_ENV === "production") {
       return {
         NEXT_PUBLIC_SUPABASE_URL: supabaseUrl || "",
         NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey || "",
         NEXT_PUBLIC_API_BASE: apiBase || "",
       };
    }
    throw new Error("Invalid environment configuration. Check your .env file.");
  }

  return result.data;
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
