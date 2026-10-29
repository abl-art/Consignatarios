-- Baja manual de certificados (29/10/2026): agrega 'baja_manual' a los
-- motivos de anulación válidos — la usa bajaManualCertificado
-- (lib/actions/seguros.ts) para dar de baja el seguro de clientes con mora
-- alta declarados incobrables, hasta que haya regla para automatizarlo.
-- Re-ejecutable.

ALTER TABLE seguros_certificados
  DROP CONSTRAINT IF EXISTS seguros_certificados_motivo_anula_check;

ALTER TABLE seguros_certificados
  ADD CONSTRAINT seguros_certificados_motivo_anula_check
  CHECK (motivo_anula IN ('descartada', 'contracargo', 'baja_manual'));
