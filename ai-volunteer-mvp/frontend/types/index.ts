import { z } from "zod";

// --- Needs ---

export const NeedStatusSchema = z.enum([
  "needs_validation",
  "unassigned",
  "pending_acceptance",
  "no_volunteers",
  "assigned",
  "completed",
  "failed",
]);

export const NeedSchema = z.object({
  need_id: z.string().uuid(),
  source: z.string(),
  submitted_at: z.string().datetime(),
  location_geo: z.string().nullable().optional(),
  location_text: z.string(),
  category: z.string(),
  subcategory: z.string().nullable().optional(),
  urgency: z.string(),
  raw_text: z.string(),
  confidence: z.number(),
  status: NeedStatusSchema,
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  ngo_id: z.string().nullable().optional(),
  contact_number: z.string(),
});

export type Need = z.infer<typeof NeedSchema>;
export type NeedStatus = z.infer<typeof NeedStatusSchema>;

// --- Volunteers ---

export const VolunteerSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  city: z.string(),
  contact_number: z.string(),
  skills: z.array(z.string()),
});

export type Volunteer = z.infer<typeof VolunteerSchema>;

// --- Match Logs ---

export const MatchLogSchema = z.object({
  need_id: z.string().uuid(),
  volunteer_id: z.string().uuid(),
  match_score: z.number(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
});

export type MatchLog = z.infer<typeof MatchLogSchema>;

// --- API Request/Response Schemas ---

export const SubmitNeedRequestSchema = z.object({
  Body: z.string().min(5, "Need description must be at least 5 characters"),
  From: z.string().min(10, "Valid contact number is required"),
  MediaUrl0: z.string().optional(),
});

export type SubmitNeedRequest = z.infer<typeof SubmitNeedRequestSchema>;
