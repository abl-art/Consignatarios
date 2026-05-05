ALTER TABLE tacs_cargados ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'cargado' CHECK (estado IN ('solicitado', 'cargado'));
