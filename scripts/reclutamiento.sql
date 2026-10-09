-- Pestaña Reclutamiento (sep 2026): búsquedas de personal con análisis IA.
-- Flujo: CV PDF → Claude genera ficha con puntajes (criterios configurables por búsqueda);
-- entrevista = link de Drive PRIVADO → AssemblyAI transcribe → Claude analiza.
-- La primera búsqueda (Business Owner GOcelular + GO Market) se siembra con
-- scripts/seed-reclutamiento.mjs desde el análisis hecho en sesión local el 28-29/9.

CREATE TABLE IF NOT EXISTS rec_busquedas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  mandato text,
  -- [{clave, nombre, prioritario}] — default: criterios v2 del Business Owner
  criterios jsonb NOT NULL DEFAULT '[]',
  caso text,                       -- caso técnico que resuelven los candidatos (entra al prompt de análisis)
  recomendacion text,              -- markdown generado por Claude (botón Regenerar)
  recomendacion_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rec_candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  busqueda_id uuid NOT NULL REFERENCES rec_busquedas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  arquetipo text,
  etiquetas jsonb NOT NULL DEFAULT '[]',   -- ["disponible", "Córdoba", ...]
  resumen text,
  cv_path text,                            -- storage bucket 'cvs'
  scores jsonb NOT NULL DEFAULT '{}',      -- {clave_criterio: 1..5}
  favor jsonb NOT NULL DEFAULT '[]',
  riesgos jsonb NOT NULL DEFAULT '[]',
  preguntas text,
  -- pendiente | pasa | no_pasa  (columna cliqueable "Pasa a Assessment")
  assessment text NOT NULL DEFAULT 'pendiente',
  assessment_nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_candidatos_busqueda_idx ON rec_candidatos (busqueda_id);

CREATE TABLE IF NOT EXISTS rec_entrevistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES rec_candidatos(id) ON DELETE CASCADE,
  titulo text,                             -- "Caso práctico · 27 min"
  drive_link text,                         -- link original que pega el admin
  drive_file_id text,                      -- extraído del link
  duracion_min numeric,
  -- pendiente | transcribiendo | analizando | listo | error
  estado text NOT NULL DEFAULT 'pendiente',
  assemblyai_id text,
  transcript text,
  analisis jsonb,                          -- {veredicto, intro, bien[], mal[], lectura}
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_entrevistas_candidato_idx ON rec_entrevistas (candidato_id);
