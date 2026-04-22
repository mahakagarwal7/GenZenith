CREATE TABLE IF NOT EXISTS public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL,
  prediction_horizon text NOT NULL,
  predicted_needs jsonb NOT NULL DEFAULT '[]'::jsonb,
  alert_level text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_region
  ON public.predictions (region);

CREATE INDEX IF NOT EXISTS idx_predictions_created_at
  ON public.predictions (created_at DESC);