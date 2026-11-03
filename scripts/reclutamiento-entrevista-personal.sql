-- Entrevista personal por candidato (3/11/2026): preguntas personalizadas
-- generadas por Claude a partir de la ficha + lo que dejaron las entrevistas
-- técnicas, con respuestas y puntaje 1-5 que Emiliano carga en vivo.
-- Shape: { generada_at, preguntas: [{id, tema, pregunta, busca}],
--          respuestas: { [preguntaId]: { nota, puntaje } } }
-- EJECUTADA en prod el 3/11/2026.
ALTER TABLE rec_candidatos ADD COLUMN IF NOT EXISTS entrevista_personal jsonb;
