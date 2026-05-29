CREATE TABLE IF NOT EXISTS tenencia_modelos_ocultos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  model_code text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);
