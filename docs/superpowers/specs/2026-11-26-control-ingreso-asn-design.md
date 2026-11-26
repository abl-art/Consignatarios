# Control de ingreso de ASN por link (provisorio)

**Fecha:** 2026-11-26 · **Aprobado por Emiliano en chat** (novedad: envío MANUAL).

## Problema
Andreani no tiene API de ingreso: no sabemos si los IMEIs de una ASN entraron
físicamente (caso Edge 70: recibida y nunca ingresada). Nosotros sí sabemos qué
IMEIs deberían entrar (`inventory_intake_items.asn_transaction_id` →
`andreani_wh_transactions` tipo `abastecimiento`).

## Solución (provisoria, simple)
1. **Link público por ASN** (`/share/asn?token=…`, patrón de /share/stock, token
   UUID en tabla `asn_controles` de Supabase): el operario del depósito lo abre
   y pistolea caja por caja. Cada IMEI se marca verde (esperado), rojo
   (sobrante: no es de esta ASN) o repetido. Kits/addons se listan informativos
   (código × cantidad, sin escaneo). "Finalizar control" guarda leídos,
   sobrantes y nota; el resultado queda read-only.
2. **Vista admin** `/compras/ingresos-asn` (card nueva en /compras): últimas
   ASNs de la réplica con estado del control (sin control / pendiente / OK /
   con diferencias), botones Crear link / Copiar link, detalle de faltantes y
   sobrantes, y botón **"Avisar a GOcelular"** — MANUAL, decisión de Emiliano —
   que manda la diferencia por el canal de Novedades v2 ya existente
   (`enviarNovedadGocelular`, tipo `aviso`) y guarda cuándo se avisó.
3. Sin login en el link (token no adivinable); el avance no se persiste hasta
   Finalizar (alcance provisorio).

## Datos
`asn_controles`: id, asn_id (uuid de andreani_wh_transactions), asn_transaccion,
token unique, estado pendiente|finalizado, leidos jsonb, sobrantes jsonb, nota,
finalizado_at, novedad_enviada_at, created_at. RLS off.
Lógica pura en `lib/asn-control.ts` (comparación esperados vs leídos) con tests.
