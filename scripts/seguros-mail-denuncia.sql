-- Seguros por Robo — etapa mail al cliente + formulario v2 (30/10/2026)
--
-- mail_enviado_at: marca de envío del mail de bienvenida con el certificado.
--   NULL = pendiente de envío; el sync lo manda (claim-first) y reintenta en
--   la próxima corrida si el SMTP falló.
-- baja_imei_gestion: número de gestión/constancia que la operadora le dio al
--   cliente al dar de baja el IMEI por el *910 — obligatorio en el formulario
--   público de denuncia, visible para Yami en la pestaña Siniestros.

ALTER TABLE seguros_certificados
  ADD COLUMN IF NOT EXISTS mail_enviado_at timestamptz;

ALTER TABLE seguros_siniestros
  ADD COLUMN IF NOT EXISTS baja_imei_gestion text;
