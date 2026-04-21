# GenZenith

## Quick Start (No Virtual Environment)

Run this from the repository root to install dependencies and run tests for both services:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-and-test.ps1
```

What this script does:

- Installs Node/TypeScript dependencies in `ai-volunteer-mvp/functions`.
- Builds and tests the TypeScript functions project.
- Installs Python dependencies with `--user` in `ai-volunteer-mvp/prediction-service`.
- Runs Python tests with `pytest`.

## Node Version

The functions package targets Node 20. A `.nvmrc` file is included at `ai-volunteer-mvp/functions/.nvmrc`.
