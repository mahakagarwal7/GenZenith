# GenZenith - Complete Setup Guide

A comprehensive guide for setting up GenZenith AI Volunteer Matching Platform from scratch.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Supabase Configuration](#supabase-configuration)
4. [Project Initialization](#project-initialization)
5. [Database Setup](#database-setup)
6. [External API Keys](#external-api-keys)
7. [Running the Project](#running-the-project)
8. [Testing the Pipeline](#testing-the-pipeline)
9. [Troubleshooting](#troubleshooting)
10. [Quick Reference Commands](#quick-reference-commands)

---

## Prerequisites

Before starting, ensure you have the following installed on your machine:

### Required Software

- **Node.js 20.x** → [Download](https://nodejs.org)
  - Verify: `node --version` (should show v20.x.x)
  - npm will be included with Node.js

- **Python 3.10+** → [Download](https://www.python.org)
  - Verify: `python --version`
  - Make sure it's added to PATH

- **Docker Desktop** → [Download](https://www.docker.com/products/docker-desktop)
  - Required for running local Supabase
  - Must be running in the background

- **Git** → [Download](https://git-scm.com)
  - Verify: `git --version`

- **Supabase CLI** → Install via npm:
  ```powershell
  npm install -g supabase
  ```

  - Verify: `supabase --version`

### Recommended Tools

- **Visual Studio Code** → [Download](https://code.visualstudio.com)
- **Postman** → [Download](https://www.postman.com) (for testing APIs)
- **DBeaver** → [Download](https://dbeaver.io) (optional, for database visualization)

---

## Environment Setup

### Step 1: Clone or Extract the Repository

```powershell
# If cloning from git
git clone <repository-url>
cd GenZenith

# If you already have the files, just navigate to the directory
cd GenZenith
```

### Step 2: Create `.env` File

The `.env` file contains all configuration needed for the application.

**Option A: Using the provided template (Recommended)**

```powershell
# Copy the example env file
Copy-Item -Path ".env.example" -Destination ".env"
```

**Option B: Create manually**

Create a new file named `.env` in the project root with the following structure:

```env
# ============================================================
# SUPABASE CONFIGURATION
# ============================================================
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=sb_publishable_YOUR_ANON_KEY_HERE
SUPABASE_SERVICE_ROLE_KEY=sb_secret_YOUR_SERVICE_ROLE_KEY_HERE
SUPABASE_JWT_SECRET=super-secret-jwt-token-change-in-production

# ============================================================
# APPLICATION CONFIGURATION
# ============================================================
DEFAULT_NGO_ID=ngo_default
SUPABASE_NEED_EVIDENCE_BUCKET=need-evidence

# ============================================================
# GOOGLE SERVICES
# ============================================================
GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here
GOOGLE_CLOUD_VISION_API_KEY=your-google-vision-api-key-here
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}

# ============================================================
# TWILIO CONFIGURATION (for SMS/WhatsApp)
# ============================================================
TWILIO_ACCOUNT_SID=your-twilio-sid-here
TWILIO_AUTH_TOKEN=your-twilio-auth-token-here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# ============================================================
# DATABASE (PostgreSQL from Supabase)
# ============================================================
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### Step 3: Update `.env` with Your Values

After creating `.env`, you'll need to fill in actual API keys and credentials. See [External API Keys](#external-api-keys) section below.

---

## Supabase Configuration

### Step 1: Start Docker

Ensure Docker Desktop is running. If not, launch it:

```powershell
# On Windows, Docker Desktop usually auto-starts
# If not, search for "Docker Desktop" and launch it
```

### Step 2: Initialize Supabase Project

Navigate to the `ai-volunteer-mvp` directory:

```powershell
cd ai-volunteer-mvp
supabase init
```

This creates a `.supabase` folder with local configuration.

### Step 3: Start Supabase Local Stack

```powershell
supabase start
```

**What this does:**

- Starts PostgreSQL database on port 54322
- Starts REST API on port 54321
- Starts Auth service
- Starts Storage service
- Starts Studio (Web UI) on port 54323

**Output will show:**

```
╭──────────────────────────────────────╮
│ 🔧 Development Tools                 │
├─────────┬────────────────────────────┤
│ Studio  │ http://127.0.0.1:54323     │
│ Mailpit │ http://127.0.0.1:54324     │
│ MCP     │ http://127.0.0.1:54321/mcp │
╰─────────┴────────────────────────────╯

╭──────────────────────────────────────────────────────╮
│ 🌐 APIs                                              │
├────────────────┬─────────────────────────────────────┤
│ Project URL    │ http://127.0.0.1:54321              │
│ REST           │ http://127.0.0.1:54321/rest/v1      │
│ GraphQL        │ http://127.0.0.1:54321/graphql/v1   │
│ Edge Functions │ http://127.0.0.1:54321/functions/v1 │
╰────────────────┴─────────────────────────────────────╯

╭───────────────────────────────────────────────────────────────╮
│ ⛁ Database                                                    │
├─────┬─────────────────────────────────────────────────────────┤
│ URL │ postgresql://postgres:postgres@127.0.0.1:54322/postgres │
╰─────┴─────────────────────────────────────────────────────────╯
```

**Access the Web UI:**

- Open browser → `http://127.0.0.1:54323`
- Explore tables, data, and settings

### Step 4: Keep Supabase Running

This terminal window must stay open. Open a **new PowerShell terminal** for the next steps.

---

## Database Setup

### Step 1: Apply Migrations

From a new terminal (keep Supabase running in the first):

```powershell
cd ai-volunteer-mvp
supabase db push
```

This executes all `.sql` files in `supabase/migrations/` folder:

- `20260422000001_firestore_to_supabase.sql` - Creates tables, enums, indexes, RLS policies
- `20260422000002_add_volunteer_contact_number.sql` - Adds contact column
- `20260422000003_predictions_table.sql` - Creates predictions table
- `20260422000004_predictions_rls.sql` - Adds RLS policies for predictions

**What gets created:**

- Tables: `needs`, `volunteers`, `profiles`, `match_logs`, `predictions`
- Extensions: `postgis`, `pgcrypto`
- Enums: `need_urgency`, `need_status`, `volunteer_status`, `user_role`
- Indexes for performance
- RLS policies for security

### Step 2: Verify Database

Open Supabase Studio at `http://127.0.0.1:54323`:

- Go to **SQL Editor**
- Run: `SELECT * FROM needs LIMIT 1;`
- Should return empty result (no error = success)

Alternatively, view tables:

- Click **Table Editor** in left sidebar
- See: `needs`, `volunteers`, `profiles`, `match_logs`, `predictions`

### Step 3: Seed Sample Data (Optional)

To test with sample data:

```powershell
# From Supabase Studio → SQL Editor, run:
INSERT INTO volunteers (id, contact_number, skills, status, location)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  '+1234567890',
  ARRAY['medical', 'first_aid'],
  'available',
  ST_SetSRID(ST_MakePoint(73.0805, 18.9039), 4326)
);
```

---

## External API Keys

### Google Maps API

**Why?** Geocoding: Convert addresses to latitude/longitude coordinates.

**Steps:**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Maps JavaScript API** and **Geocoding API**:
   - Search "Geocoding API" → Click → Enable
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy the API key
6. Add to `.env`:
   ```env
   GOOGLE_MAPS_API_KEY=AIzaSyD_nFqM9z1-4bZ7pq8m9k0j1l2m3n4o5p6q
   ```

### Google Cloud Vision API (OCR)

**Why?** Extract text from images sent via WhatsApp.

**Two authentication methods:**

#### Method 1: Service Account (Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Cloud Vision API**
3. Go to **IAM & Admin** → **Service Accounts** → **Create Service Account**
   - Name: `vision-ocr`
   - Role: `Cloud Vision API User`
   - Click **Create**
4. Go to newly created service account → **Keys** → **Add Key** → **Create new key** → **JSON**
5. Download the JSON file to `secrets/service-account.json`
6. Run:
   ```powershell
   .\setup-vision-env.ps1
   ```
   This automatically injects the JSON into `.env` as `GOOGLE_SERVICE_ACCOUNT_JSON`

#### Method 2: API Key (Simple)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create an API Key (same process as Maps)
3. Add to `.env`:
   ```env
   GOOGLE_CLOUD_VISION_API_KEY=AIzaSyD_nFqM9z1-4bZ7pq8m9k0j...
   ```

### Twilio API (SMS/WhatsApp)

**Why?** Send SMS and WhatsApp messages to volunteers.

**Steps:**

1. Go to [Twilio Console](https://www.twilio.com/console)
2. Sign up or log in
3. Go to **Account** → Copy:
   - Account SID → `TWILIO_ACCOUNT_SID`
   - Auth Token → `TWILIO_AUTH_TOKEN`
4. Go to **Phone Numbers** → Get a **Twilio Phone Number**
   - Copy number → `TWILIO_PHONE_NUMBER`
5. For WhatsApp: Get a **WhatsApp Business Phone Number** (optional)
   - Copy number → `TWILIO_WHATSAPP_NUMBER`
6. Update `.env`:
   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   TWILIO_PHONE_NUMBER=+1234567890
   TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
   ```

---

## Project Initialization

### Step 1: Install Node Dependencies

```powershell
cd ai-volunteer-mvp/functions
npm install
```

**What this installs:**

- TypeScript compiler
- Jest testing framework
- Supabase JS client
- Google Cloud Vision SDK

### Step 2: Install Python Dependencies

```powershell
cd ai-volunteer-mvp/prediction-service
pip install --user -r requirements.txt
```

**What this installs:**

- Flask (web framework)
- Prophet (time series forecasting)
- Pandas (data manipulation)
- Psycopg2 (PostgreSQL driver)

---

## Running the Project

### Terminal 1: Supabase (Already Running)

```powershell
# In first terminal (still running from earlier)
supabase start
# Keep this window open
```

### Terminal 2: Edge Functions

```powershell
# Open new terminal
cd ai-volunteer-mvp

# Serve the three edge functions
supabase functions serve whatsapp-webhook --env-file ../.env
supabase functions serve volunteer-response --env-file ../.env
supabase functions serve need-created --env-file ../.env
```

**Watch for:**

```
Serving functions on http://127.0.0.1:54321/functions/v1/<function-name>
  - http://127.0.0.1:54321/functions/v1/whatsapp-webhook
  - http://127.0.0.1:54321/functions/v1/volunteer-response
  - http://127.0.0.1:54321/functions/v1/need-created
```

### Terminal 3: Python Prediction Service

```powershell
# Open another new terminal
cd ai-volunteer-mvp/prediction-service
python needPredictionService.py
```

**Watch for:**

```
 * Running on http://127.0.0.1:5000
```

---

## Testing the Pipeline

### Run Full Test Suite

```powershell
# From project root
powershell -ExecutionPolicy Bypass -File .\setup-and-test.ps1
```

**This will:**

1. Start Supabase
2. Install Node dependencies
3. Build TypeScript
4. Run Jest tests (8 test suites)
5. Install Python dependencies
6. Run Pytest tests

**Expected output:**

```
Test Suites: 8 passed, 8 total
Tests:       20 passed, 20 total
```

### Manual Testing with Postman

#### Test 1: Submit WhatsApp Message

```
POST http://127.0.0.1:54321/functions/v1/whatsapp-webhook

Headers:
  Content-Type: application/json
  apikey: sb_publishable_YOUR_ANON_KEY_HERE

Body:
{
  "Body": "Emergency! Blood needed immediately near Howrah Bridge, Kolkata",
  "From": "+919876543210"
}

Expected Response:
{
  "status": "ok",
  "needId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

#### Test 2: Check Database

```
GET http://127.0.0.1:54321/rest/v1/needs

Headers:
  apikey: sb_publishable_YOUR_ANON_KEY_HERE

Expected: Array of needs records
```

#### Test 3: Trigger Matching

```
POST http://127.0.0.1:54321/functions/v1/need-created

Headers:
  Content-Type: application/json
  apikey: sb_publishable_YOUR_ANON_KEY_HERE

Body:
{
  "record": {
    "need_id": "from-test-1-needId"
  },
  "need_id": "from-test-1-needId"
}

Expected Response:
{
  "ok": true,
  "needId": "...",
  "matchedCount": 0,
  "topVolunteerId": null
}
```

#### Test 4: Volunteer Response

```
POST http://127.0.0.1:54321/functions/v1/volunteer-response

Headers:
  Content-Type: application/json
  apikey: sb_publishable_YOUR_ANON_KEY_HERE

Body:
{
  "needId": "from-test-1-needId",
  "volunteerId": "volunteer-uuid-here",
  "response": "YES"
}

Expected Response:
{
  "ok": true,
  "status": "assigned",
  "needId": "...",
  "volunteerId": "..."
}
```

---

## Troubleshooting

### Docker Not Running

**Problem:** `Error: failed to start service: Docker daemon is not running`

**Solution:**

1. Open Windows Start Menu
2. Search "Docker Desktop"
3. Launch it
4. Wait 30 seconds for it to start
5. Try `supabase start` again

### Port Already in Use

**Problem:** `Error: port 54321 is already in use`

**Solution:**

```powershell
# Stop existing Supabase
supabase stop

# Or find and kill the process
netstat -ano | findstr :54321
taskkill /PID <PID> /F

# Start fresh
supabase start
```

### Database Connection Failed

**Problem:** `FATAL: Ident authentication failed for user "postgres"`

**Solution:**

```powershell
# Reset database
supabase db reset

# Restart Supabase
supabase stop
supabase start
```

### Environment Variables Not Loading

**Problem:** `Error: Missing required environment variable: SUPABASE_URL`

**Solution:**

1. Verify `.env` file exists in project root
2. Check `.env` has correct values (not empty)
3. Restart terminals after editing `.env`
4. For edge functions, use:
   ```powershell
   supabase functions serve whatsapp-webhook --env-file ../.env
   ```

### Google Vision Returns 0% Confidence

**Problem:** `"confidence": 0` in OCR result

**Possible causes:**

- Service account JSON not set up properly
- Google Cloud Vision API not enabled
- Image URL not accessible from Deno runtime

**Solution:**

1. Verify service account JSON:
   ```powershell
   .\setup-vision-env.ps1
   ```
2. Enable Cloud Vision API in Google Cloud Console
3. Test with a public image URL (not local file)
4. Check console logs: `supabase logs`

### Node.js Version Mismatch

**Problem:** `npm warn EBADENGINE Unsupported engine`

**Solution:**

```powershell
# Install Node 20 via nvm (Windows)
# Or download from https://nodejs.org/

# Verify version
node --version
# Should show v20.x.x
```

### Tests Failing

**Problem:** Some Jest tests fail locally

**Solution:**

```powershell
# Clear node_modules and reinstall
cd ai-volunteer-mvp/functions
rm -r node_modules package-lock.json
npm install
npm test
```

---

## Quick Reference Commands

### Supabase Commands

```powershell
# Start local Supabase stack
supabase start

# Stop Supabase
supabase stop

# Reset database to clean state
supabase db reset

# Apply migrations
supabase db push

# View logs
supabase logs

# Reset and apply migrations
supabase db reset --linked  # for production
```

### Serving Functions Locally

```powershell
# Serve all three functions
cd ai-volunteer-mvp
supabase functions serve whatsapp-webhook --env-file ../.env
supabase functions serve volunteer-response --env-file ../.env
supabase functions serve need-created --env-file ../.env

# Serve single function
supabase functions serve whatsapp-webhook --env-file ../.env
```

### Node Commands

```powershell
cd ai-volunteer-mvp/functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests with watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Python Commands

```powershell
cd ai-volunteer-mvp/prediction-service

# Install dependencies
pip install --user -r requirements.txt

# Run prediction service
python needPredictionService.py

# Run tests
pytest

# Run specific test
pytest test_prediction.py -v
```

### Testing Commands

```powershell
# From project root

# Full setup and test
powershell -ExecutionPolicy Bypass -File .\setup-and-test.ps1

# Skip Supabase start (if already running)
powershell -ExecutionPolicy Bypass -File .\setup-and-test.ps1 -SkipSupabaseStart

# Reset DB before tests
powershell -ExecutionPolicy Bypass -File .\setup-and-test.ps1 -ResetLocalDb

# Run demo workflow
powershell -ExecutionPolicy Bypass -File .\demo-workflow.ps1

# Run full test suite
powershell -ExecutionPolicy Bypass -File .\run-full-test.ps1
```

### Database/SQL Commands

```powershell
# Access Supabase Studio Web UI
# Open: http://127.0.0.1:54323

# SQL Editor → Run queries:
SELECT * FROM needs;
SELECT * FROM volunteers;
SELECT * FROM match_logs;

# Insert sample volunteer
INSERT INTO volunteers (id, contact_number, skills, status)
VALUES ('vol-123', '+1234567890', ARRAY['medical'], 'available');

# View migrations
supabase migration list

# Create migration
supabase migration new create_my_table
```

---

## Common Workflows

### Workflow 1: Fresh Setup (First Time)

```powershell
# 1. Create .env
Copy-Item ".env.example" ".env"

# 2. Add API keys to .env

# 3. Start Supabase (Terminal 1)
cd ai-volunteer-mvp
supabase start

# 4. Apply migrations (Terminal 2)
supabase db push

# 5. Install dependencies (Terminal 3)
cd ai-volunteer-mvp/functions
npm install

# 6. Run tests
powershell -ExecutionPolicy Bypass -File ..\..\setup-and-test.ps1

# 7. Serve functions (Terminal 4)
cd ai-volunteer-mvp
supabase functions serve whatsapp-webhook --env-file ../.env
```

### Workflow 2: Daily Development

```powershell
# Terminal 1: Supabase
supabase start

# Terminal 2: Edge Functions
cd ai-volunteer-mvp
supabase functions serve whatsapp-webhook --env-file ../.env

# Terminal 3: Run tests
cd ai-volunteer-mvp/functions
npm test

# Terminal 4: Python service (optional)
cd ai-volunteer-mvp/prediction-service
python needPredictionService.py
```

### Workflow 3: Testing a Specific Feature

```powershell
# Test WhatsApp webhook only
cd ai-volunteer-mvp/functions
npm test -- src/ai/__tests__/handleWhatsAppWebhook.test.ts

# Test matching service
npm test -- src/matching/__tests__/intelligentMatchingService.test.ts

# Test with coverage
npm run test:coverage
```

### Workflow 4: Reset Everything (Start Fresh)

```powershell
# Stop Supabase
supabase stop

# Remove all local data
supabase db reset

# Start fresh
supabase start

# Reapply migrations
supabase db push

# Clear Node modules
cd ai-volunteer-mvp/functions
rm -r node_modules
npm install
```

---

## Environment File Reference

```env
# LOCAL DEVELOPMENT DEFAULTS (do not use in production)

# Supabase API URLs (change only if ports differ)
SUPABASE_URL=http://localhost:54321
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Supabase Keys (from 'supabase start' output - copy yours here)
SUPABASE_ANON_KEY=sb_publishable_YOUR_ANON_KEY_HERE
SUPABASE_SERVICE_ROLE_KEY=sb_secret_YOUR_SERVICE_ROLE_KEY_HERE
SUPABASE_JWT_SECRET=super-secret-jwt-token-change-in-production

# Application Settings
DEFAULT_NGO_ID=ngo_default
SUPABASE_NEED_EVIDENCE_BUCKET=need-evidence

# Google Services (get from Google Cloud Console)
GOOGLE_MAPS_API_KEY=AIzaSyD_...
GOOGLE_CLOUD_VISION_API_KEY=AIzaSyD_...
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Twilio (get from Twilio Console)
TWILIO_ACCOUNT_SID=ACxxxxxxxx...
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
```

---

## Security Notes

⚠️ **IMPORTANT:** Never commit `.env` to Git!

1. Add to `.gitignore`:

   ```
   .env
   .env.local
   secrets/
   ```

2. For production:
   - Use different, secure keys
   - Store in environment variables or secrets manager
   - Never hardcode credentials
   - Rotate API keys regularly
   - Use separate Supabase project for production

3. Database access:
   - Use RLS policies (already configured)
   - Don't expose service role key to frontend
   - Use anon key for public APIs

---

## Next Steps

After setup completes:

1. **Explore Supabase Studio** → http://127.0.0.1:54323
2. **Review Database Schema** → Table Editor
3. **Test APIs** → Use Postman or cURL
4. **Run Full Demo** → `demo-workflow.ps1`
5. **Read Documentation** → See `DEVELOPMENT.md` and `README.md`
6. **Check Unit Tests** → `ai-volunteer-mvp/functions/src/__tests__/`

---

## Getting Help

If issues arise:

1. Check **Troubleshooting** section above
2. View logs: `supabase logs`
3. Check `.env` file configuration
4. Ensure all prerequisites are installed
5. Try restarting terminals and services
6. Review error messages in console carefully

---

## Summary Checklist

- [ ] Docker Desktop installed and running
- [ ] Node.js 20.x installed
- [ ] Python 3.10+ installed
- [ ] Supabase CLI installed
- [ ] `.env` file created with values
- [ ] Google API keys obtained
- [ ] Twilio credentials obtained
- [ ] `supabase start` running in Terminal 1
- [ ] `supabase db push` completed
- [ ] npm dependencies installed
- [ ] Python dependencies installed
- [ ] Tests passing
- [ ] Edge functions serving
- [ ] Manual API tests working
- [ ] Ready for development! 🚀

---

**Last Updated:** April 22, 2026  
**Project:** GenZenith AI Volunteer Matching Platform  
**Status:** Ready for Development
