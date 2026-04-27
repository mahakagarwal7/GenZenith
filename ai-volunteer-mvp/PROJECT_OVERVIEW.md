# AI Volunteer Intelligence Platform

This document is the frontend handoff for the project. It describes the backend pipeline, supported user journeys, API entrypoints, data flow, runtime assumptions, and the behavior the frontend should account for so the UI remains robust even when external services are slow or partially unavailable.

## Project Goal

The system helps people submit urgent needs and connects those needs to suitable volunteers. The main ingestion path is currently WhatsApp-first through Twilio, with matching and assignment handled by Supabase Edge Functions and the local Supabase stack.

The frontend should be built around the following principle:

- The backend may receive needs from WhatsApp, test scripts, or future UI entrypoints.
- The frontend should not hardcode runtime URLs, phone numbers, or environment-specific values.
- The frontend should always be able to show status, retries, failures, and current assignment state clearly.

## High-Level Architecture

### Backend Stack

- Supabase local stack for Postgres, API, Auth, Storage, and Edge Functions.
- Deno Edge Functions for the main workflow.
- ngrok for exposing the local webhook endpoints publicly during WhatsApp/Twilio testing.
- Twilio WhatsApp Sandbox for inbound and outbound WhatsApp traffic.
- Optional Python prediction service for demand forecasting, separate from the main live request flow.

### Main Services

- `whatsapp-webhook`: receives inbound WhatsApp messages from Twilio, creates a need, classifies it, extracts location, and triggers matching.
- `need-created`: handles follow-up processing after a need is created and can notify volunteers.
- `volunteer-response`: processes volunteer replies and requester follow-up messages, and returns assignment details.
- `prediction-service`: forecasting sidecar, not required for the core WhatsApp request flow.

## End-to-End Pipeline

### 1. Need Submission

User sends a message in WhatsApp, for example:

- `Emergency blood needed near Park Street Kolkata`

The inbound message reaches Twilio, which forwards it to the public ngrok URL, which forwards it to the local Supabase Edge Function `whatsapp-webhook`.

What happens next:

- The body text is parsed from the Twilio form payload.
- The message is classified into a category such as medical, food, logistics, or water supply.
- A location string is extracted from the message.
- Geocoding is attempted if the configured map credentials are present.
- A new `needs` row is created in Supabase.
- A Need ID is generated and returned in TwiML.
- If geocoding succeeds and matching is possible, volunteer matching is triggered.

Expected WhatsApp reply:

- `Request received. Your Need ID is <uuid>. We are matching a volunteer now. Reply YES to receive the assigned volunteer details.`

### 2. Volunteer Matching

The matching logic ranks candidate volunteers using a blend of:

- geographic proximity
- category/skill match
- historical response rate
- active task load
- fairness / assignment distribution

The backend writes match information into `match_logs` and notifies a selected volunteer when appropriate.

### 3. Volunteer Response

A volunteer replies `YES` or `NO` over WhatsApp.

What happens next:

- The webhook identifies whether the sender is a volunteer or the requester.
- If the sender is a volunteer, the assignment flow updates the need status.
- If the sender is the requester, the webhook returns the latest matched volunteer summary.
- The endpoint returns TwiML with a human-readable message.

### 4. Requester Assignment Update

When a volunteer is assigned, the requester can receive a summary containing:

- volunteer name
- volunteer location or city
- volunteer contact number
- skills

This is the part the frontend should surface clearly in a dashboard or support screen.

## WhatsApp and Twilio Behavior

The WhatsApp flow is not a frontend UI flow, but the frontend should understand it because users may report status issues.

Important behavior:

- Twilio posts `application/x-www-form-urlencoded` payloads to the webhook.
- The response must be valid TwiML XML.
- The webhook must return `200 OK` for handled requests, even if the message is only informational.
- Twilio may send extra delivery/status callbacks.
- Those callbacks should not be treated like user chat messages.
- Replies must be made from the same WhatsApp thread / number that sent the request.

Frontend implication:

- The UI should be able to show a current WhatsApp delivery status, message logs, and the latest assignment status.
- If a user says “I replied YES but got no response,” the dashboard should help verify the latest Twilio request, webhook response, and matched need.

## Current API Entry Points

These are the important live backend endpoints used in the current pipeline:

- `/functions/v1/whatsapp-webhook`
- `/functions/v1/volunteer-response`
- `/functions/v1/need-created`

During local development, the public ngrok URL forwards to `http://localhost:54321`.

## Data Model Overview

### Needs

The `needs` table stores submitted requests.

Typical fields used by the pipeline:

- `need_id`
- `source`
- `submitted_at`
- `location_geo`
- `location_text`
- `category`
- `subcategory`
- `urgency`
- `raw_text`
- `confidence`
- `status`
- `assigned_to`
- `ngo_id`
- `contact_number`

### Volunteers

The `volunteers` table stores volunteer profiles.

Typical fields used by the pipeline:

- `id`
- `full_name`
- `city`
- `contact_number`
- `skills`

### Match Logs

The `match_logs` table stores matching activity.

Typical fields used by the pipeline:

- `need_id`
- `volunteer_id`
- `match_score`
- `timestamp`
- `metadata`

## Runtime Environment

### Local Development

- Supabase local stack runs on port `54321` for API and Edge Functions.
- Postgres runs on `54322`.
- Studio runs on `54323`.
- ngrok exposes the public tunnel used by Twilio and WhatsApp testing.

### Environment Variables

The backend is driven by environment variables. The frontend should never hardcode these values.

Common values used by the pipeline include:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `DEFAULT_NGO_ID`
- `SUPABASE_NEED_EVIDENCE_BUCKET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_WHATSAPP_NUMBER`
- `GOOGLE_MAPS_API_KEY` or equivalent geocoding key
- `GOOGLE_SERVICE_ACCOUNT_JSON` or Vision API fallback key

## Frontend Requirements

The frontend should be built to survive partial backend failure and still give a user a clear understanding of what is happening.

### Must-Have Screens / Views

- Request submission screen
- Need status / tracking screen
- Volunteer matching status screen
- Assignment details screen
- Admin or operations dashboard
- Twilio / WhatsApp activity log viewer
- Request replay or diagnostics view for support

### Must-Have UI States

- idle
- submitting
- submitted
- matching
- awaiting volunteer response
- assigned
- declined and re-matching
- no volunteers available
- needs validation
- geocode unavailable
- webhook error
- Twilio error
- retrying

### Must-Have Behaviors

- Show the Need ID immediately after request submission.
- Show the latest status of the need.
- Show whether a volunteer has been matched or assigned.
- Show the volunteer details when available.
- Show when a request is waiting for a volunteer reply.
- Show clear retry and error messaging when the webhook or external service fails.
- Never assume a request failed just because the user has not seen a WhatsApp message yet.
- Separate request state from delivery state.

## Robustness Rules For Frontend

To keep the UI reliable:

- Treat backend responses as authoritative for request state.
- Do not infer success only from WhatsApp delivery visibility.
- Store request history in the UI so the user can revisit the latest Need ID and status.
- Keep the last submitted location, category, and contact number visible for support.
- Make webhook and Twilio errors understandable to the user.
- Add a refresh or retry mechanism for status polling.
- Never hardcode the ngrok URL or local Supabase port in production UI code.

## Helpful User Journeys

### User Journey 1: Submit a New Need

1. User enters a need description and location.
2. UI sends it to the backend.
3. UI shows the generated Need ID.
4. UI shows `matching` until a volunteer is found.
5. UI updates to `assigned` when volunteer details are available.

### User Journey 2: Check Assignment Status

1. User opens the status page.
2. UI fetches the need by Need ID or recent request.
3. UI displays current status and matched volunteer info.

### User Journey 3: Troubleshoot WhatsApp Reply Issues

1. User reports they replied YES but saw nothing.
2. UI shows the latest webhook activity and response status.
3. UI clarifies whether the issue was delivery, routing, or assignment timing.

## What The Frontend Should Not Assume

- Do not assume every incoming Twilio request is a real chat message.
- Do not assume every `200 OK` means the user has visually seen the WhatsApp reply.
- Do not assume geocoding will always succeed.
- Do not assume volunteers are always available.
- Do not assume a request can only be created from the frontend; WhatsApp can create it too.

## Current Working State

At the time this document was written:

- ngrok is forwarding to the local Supabase API.
- Twilio requests are arriving at the public webhook.
- The webhook returns `200 OK` with valid TwiML.
- The Deno editor/type errors have been addressed for the Supabase edge functions.
- The pipeline is operational for local testing and WhatsApp sandbox testing.

## Recommended Next Frontend Implementation

Build the frontend around a request-centric model:

- Request creation form
- Status timeline
- Matching indicator
- Volunteer assignment card
- Diagnostics panel for webhook activity
- Admin view for all needs and volunteers

If the frontend is built with these views and states, it will stay aligned with the existing backend pipeline and be easier to maintain when the backend grows.
