# Facturas de Consignatarios — Spec

## Contexto

Los consignatarios cobran comisiones mensuales por las ventas que realizan. Para poder pagarles, necesitan subir la factura correspondiente. Hoy esto se hace por WhatsApp/email, generando demoras y pérdida de documentos. Se necesita un flujo dentro de la app donde el consignatario suba su factura y el admin la descargue para enviar a pagos, sin comunicación manual.

## Flujo

1. Admin genera liquidaciones del mes
2. Consignatario completa auto-auditoría → liquidación pasa a "pendiente"
3. Consignatario ve la liquidación pendiente y sube el PDF de la factura
4. Admin ve cuáles tienen factura y cuáles no
5. Descarga individual o masiva (ZIP del mes)
6. Marca como pagada (solo posible si tiene factura)

## Portal consignatario (mis-liquidaciones)

- En cada liquidación con estado "pendiente": botón "Subir factura"
- Solo acepta PDF
- Una vez subida: muestra "Factura subida ✓" con opción de reemplazar
- Si la liquidación está "retenida": no puede subir (primero auto-auditoría)

## Panel admin (liquidaciones)

- Columna nueva "Factura" en la tabla: ✓ verde si tiene, ✗ rojo si falta
- Click en ✓ para descargar el PDF individual
- Botón "Descargar facturas del mes" → ZIP con todos los PDFs del mes
- Bloqueo: no permite marcar "pagada" si no tiene factura adjunta

## Storage

- Supabase Storage bucket: `facturas`
- Nombre archivo: `{mes}_{consignatario_id}.pdf` (ej: `2026-04_abc123.pdf`)
- Se guarda la URL en la liquidación (campo `factura_url`)

## Modelo de datos

Agregar a la tabla de liquidaciones o a flujo_config:
- `factura_url` (text, nullable) en la liquidación

Como las liquidaciones se guardan en `flujo_config` como JSON, agregar el campo `facturaUrl` al JSON de cada liquidación.

## Archivos a crear/modificar

### Nuevos
- `app/api/facturas/upload/route.ts` — endpoint para subir PDF a Supabase Storage
- `app/api/facturas/download-zip/route.ts` — endpoint para descargar ZIP del mes

### Modificar
- `app/(consignatario)/mis-liquidaciones/page.tsx` — agregar botón subir factura
- `app/(admin)/liquidaciones/page.tsx` — agregar columna factura, bloqueo pagada, botón ZIP
- `lib/actions/liquidaciones.ts` — agregar funciones de factura
