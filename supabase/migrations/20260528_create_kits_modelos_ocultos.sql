CREATE TABLE IF NOT EXISTS kits_modelos_ocultos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  modelo text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);
