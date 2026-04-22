# GenZenith

## Quick Start (No Virtual Environment)

Run this from the repository root to install dependencies and run tests for both services:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-and-test.ps1
```

Useful options:

```powershell
# Skip starting local Supabase services
powershell -ExecutionPolicy Bypass -File .\setup-and-test.ps1 -SkipSupabaseStart

# Start Supabase and reset local DB before tests
powershell -ExecutionPolicy Bypass -File .\setup-and-test.ps1 -ResetLocalDb
```

What this script does:

- Installs Node/TypeScript dependencies in `ai-volunteer-mvp/functions`.
- Builds and tests the TypeScript functions project.
- Installs Python dependencies with `--user` in `ai-volunteer-mvp/prediction-service`.
- Runs Python tests with `pytest`.

## Runtime (No Firebase Tooling)

Backend hosting is now Supabase-native via Edge Functions (Deno runtime).

From `ai-volunteer-mvp` run:

```bash
supabase start
supabase functions serve whatsapp-webhook --env-file ../.env
supabase functions serve volunteer-response --env-file ../.env
supabase functions serve need-created --env-file ../.env
```

## Node Version

The functions package targets Node 20. A `.nvmrc` file is included at `ai-volunteer-mvp/functions/.nvmrc`.
