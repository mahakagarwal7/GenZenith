import { z } from "zod";

/**
 * Shared validation schemas for backend communication.
 * These ensure that the frontend never consumes malformed data 
 * from the WhatsApp/Supabase pipeline.
 */

export const ApiNeedSchema = z.object({
  need_id: z.string().uuid(),
  status: z.enum([
    "submitted",
    "classified",
    "geocoding",
    "matching",
    "awaiting",
    "assigned",
    "failed",
    "no_volunteers"
  ]),
  location_text: z.string().optional(),
  category: z.string().optional(),
  submitted_at: z.string().datetime(),
  raw_text: z.string().optional(),
});

export const ApiVolunteerSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  city: z.string(),
  contact_number: z.string(),
  skills: z.array(z.string()),
});

export type ApiNeed = z.infer<typeof ApiNeedSchema>;
export type ApiVolunteer = z.infer<typeof ApiVolunteerSchema>;
