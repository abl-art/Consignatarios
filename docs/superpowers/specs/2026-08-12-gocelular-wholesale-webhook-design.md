# Integración: webhook de venta mayorista a GOcelular desde proformas

**Fecha:** 2026-08-12 · **Estado:** diseño aprobado, pendiente de implementación

## Contexto

GOcelular expone el webhook de venta mayorista (`POST https://gocelular.gocuotas.com/api/webhooks/gocelular/wholesale`, spec en `gocelular-wholesale-webhook.md` de Pedro). Nuestro sistema de proformas le avisa cada proforma aprobada; GOcelular marca los IMEIs como `sold_wholesale`, registra la venta y gestiona la Factura A. Tiene dos modos discriminados por `fulfillment`:

- **`stock_local`** (o ausente): payload clásico con `imeis[]` del lote físico nuestro.
- **`andreani_wh`**: despacho directo desde el warehouse — sin IMEIs (prohibidos), con `delivery` obligatorio; GOcelular reserva stock por SKU y encola el despacho.

Precedente: la integración del webhook de compras (spec `2026-08-12-gocelular-purchase-webhook-design.md`) ya operativa — mismo secret (validado contra wholesale), mismo esquema de firma, cliente HMAC reusable en `lib/gocelular-webhook.ts`.

## Decisiones tomadas (con Emiliano, 2026-08-12)

| Decisión | Elección |
| --- | --- |
| Modos | **Ambos** (`stock_local` y `andreani_wh`), selector `origen` en la proforma (default stock_local) |
| Disparo warehouse | **Automático al confirmar la proforma** (botón Confirmar) |
| Disparo stock local | **Automático al completarse la asignación de IMEIs** (asignados = unidades de la proforma; al confirmar aún no hay IMEIs) |
| Datos de entrega (warehouse) | **Campos estructurados en `clientes_mayoristas`**, reusados por cada proforma |
| Condición de venta | `current_account` fijo + campo **`plazo_dias` en el cliente (default 70)** |
| Enfoque | **B: pre-validación local contra tablas GOcelular + envío** |
| La confirmación nunca se bloquea por el webhook | La proforma queda confirmada aunque la validación/envío falle; el chip muestra el error con reintento |

## Diferencias críticas vs. el webhook de compras

1. **Idempotencia legacy en stock_local**: el `timestamp` del body **participa del hash** — un reintento con timestamp regenerado da `409 proforma_conflict` espurio. Solución: persistir **`payloadEnviado`** (JSON string exacto) en la proforma al primer intento; todo reintento reusa ese body byte-idéntico con headers de firma frescos. En `andreani_wh` usa `canonicalHashV2` (excluye timestamp), pero el mecanismo se aplica uniforme.
2. **No hay pending_alias**: en ventas, SKU sin match **rechaza** (`sku_desconocido`).
3. **IMEIs elegibles**: cada IMEI debe estar `available` o `consigned` **al mismo store** en su `inventory_items`; cualquier otro estado rechaza el batch completo.
4. **`idempotent_replay` es la consulta oficial de estado**: el replay devuelve `fa_status` actual — se usa para refrescar el estado de la Factura A.
5. **Envelope de error distinto en modo legacy** (`{error, details}`) vs. modo andreani_wh (`{result, code, request_id, errors[]}`) — el cliente parsea ambos.
6. **store_mismatch / incidente XOXO**: `gocuotas_store_id` equivocado que resuelve a otro local real se rechaza, pero un ID inexistente con nombre válido resuelve **en silencio** por fallback de nombre. La pre-validación verifica el ID contra su base ANTES de enviar.

## Modelo de datos (migración SQL en Supabase — nombrar la query en el SQL Editor)

**`clientes_mayoristas`** (ALTER TABLE):
- `plazo_dias integer NOT NULL DEFAULT 70`
- `entrega_nombre text`, `entrega_dni text`, `entrega_telefono text`, `entrega_email text`, `entrega_calle text`, `entrega_numero text`, `entrega_piso_depto text`, `entrega_localidad text`, `entrega_cp text`, `entrega_provincia text`

**`proformas`** (ALTER TABLE):
- `origen text NOT NULL DEFAULT 'stock_local'` (check: `stock_local` | `andreani_wh`)
- `gocelular jsonb` — shape TS `GocelularVentaEstado`:

```ts
{
  estado: 'no_enviado' | 'validacion_fallida' | 'error_reintentable' | 'rechazado' | 'informado'
  saleId?: string
  faStatus?: string          // pending | processing | pending_authorization | emitted | failed
  dispatchId?: string        // solo andreani_wh
  numeroOrdenExterna?: string
  enviadoAt?: string
  warnings?: string[]        // ej. truncado de recipient_name
  errores?: string[]
  codigoError?: string
  payloadEnviado?: string    // JSON exacto del primer intento — reintentos byte-idénticos
}
```

## Payload

| Campo | Fuente |
| --- | --- |
| `proforma_number` | `String(nro_proforma)` (canónico `^[1-9][0-9]*$`, ya arranca en 145) |
| `gocuotas_store_id` | `proforma.store_id` — si falta, `validacion_fallida` |
| `consignatario` | nombre del local en GOcelular (pre-validado contra su tabla de stores por el `store_id`) |
| `buyer.cuit` | `cliente.cuit` (validado dígito verificador AFIP) |
| `buyer.name` | `cliente.razon_social` (fallback `nombre_comercial`) |
| `buyer.address` | `cliente.direccion_entrega` (opcional) |
| `buyer.tax_treatment` | `cliente.condicion_iva` |
| `lines[]` | `proforma_items`: `description` = `producto_nombre`, `quantity` = `cantidad`, `gross_subtotal` = `subtotal_con_iva` como decimal string |
| `total_amount` | `total_con_iva` — verificado en centavos = Σ gross_subtotal antes de enviar |
| `sell_condition` | `{ type: 'current_account', days: cliente.plazo_dias }` |
| `imeis` (stock_local) | asignaciones de la proforma (`asignaciones` con `proforma_id` → `asignacion_items` → `dispositivos.imei`) |
| `fulfillment` + `delivery` (andreani_wh) | `'andreani_wh'` + campos `entrega_*` del cliente; `lines[]` en este modo llevan además `line_reference` (L1..Ln), `item_type` y `sku` de fabricante |
| `timestamp` | ISO del primer intento (persistido en `payloadEnviado`) |

⚠️ **Supuesto a confirmar con Pedro en la prueba**: `gross_subtotal` es **con IVA** (`subtotal_con_iva`) — es lo que factura la Factura A. Si fuera neto, cambiar a `precio_venta_neto × cantidad`.

⚠️ **Modo andreani_wh — SKU de fabricante**: `proforma_items` solo tiene `producto_id`/`producto_nombre`; el SKU de fabricante se resuelve vía `device_model_skus`/`device_models` (match por nombre de modelo) o `store_products` (addons). Sin resolución inequívoca → `validacion_fallida` pidiendo mapear el producto.

## Pipeline

`informarVentaGocelular(proformaId)` (server action, guarda anti-reentrada como compras):

1. Cargar proforma + cliente + (stock_local) IMEIs asignados.
2. Si `gocelular.estado === 'informado'` → replay permitido solo vía "Actualizar estado FA" (usa `payloadEnviado`); no re-disparo automático.
3. **Pre-validación** (módulo puro `lib/wholesale-validation.ts` + catálogo cargado de GOcelular):
   - CUIT: 11 dígitos + verificador AFIP. `nro_proforma` presente y canónico.
   - Store: `store_id` existe y activo en la base GOcelular; el nombre del local coincide (guard local anti-XOXO).
   - Montos: formato `^\d+(\.\d{1,2})?$`, Σ `gross_subtotal` = `total_amount` en centavos, ≤ $500M.
   - stock_local: 1–500 IMEIs, sin duplicados, Σ `quantity` = `imeis.length`, cada IMEI `available` o `consigned` al mismo store en `inventory_items`.
   - andreani_wh: delivery completo (formatos/limites de la doc), provincia contra catálogo GOcelular, SKUs resueltos y activos, stock WH suficiente por SKU (anticipa `stock_insuficiente`), sin IMEIs.
4. Enviar: primer intento construye el payload y lo persiste como `payloadEnviado` ANTES del POST; reintentos (automáticos ante timeout/5xx y manuales) reusan ese body exacto. Cliente: `sendWholesaleWebhook(rawBody)` en `lib/gocelular-webhook.ts` (misma firma/secret/retries que purchase; parsea ambos envelopes de error).
5. Persistir resultado en `proformas.gocelular` (UPDATE de columna jsonb, no upsert de fila).

**Disparos:**
- `confirmarProforma`: tras confirmar OK, si `origen = 'andreani_wh'` → `informarVentaGocelular` (no bloqueante, con log de errores).
- Confirmación de asignación (acción existente de Mayoristas > Asignaciones): tras guardar, si la proforma es `stock_local` y asignados = unidades → `informarVentaGocelular` (no bloqueante).

**Interpretación de respuestas:** `200 accepted`/`reserved` → `informado` (con `sale_id`, `fa_status`/`dispatch`); `200 idempotent_replay` → `informado` + actualizar `faStatus`; `4xx` → `rechazado` con mensajes en español por código (`invalid_payload`, `invalid_imei`, `duplicate_imeis`, `store_mismatch`, `imeis_invalid` con detalle por IMEI y leyenda "reenviable tras corregir", `sku_desconocido`, `sku_inactivo`, `stock_insuficiente` con sku/requested/available, `addon_fulfillment_unavailable` con "no reintentar, avisar a GOcelular", `proforma_conflict` con "coordinación manual"); timeout/5xx/`503` → `error_reintentable`.

## UI

- **Proformas**: selector "Origen" al crear (Stock local default / Warehouse Andreani); chip de estado GOcelular en la tarjeta (mismos 5 estados/colores que el gestor de compras) con detalle expandible (`sale_id`, `fa_status`, dispatch, warnings, errores) y botones: "Reintentar" (`validacion_fallida`/`error_reintentable`/`rechazado` salvo conflict), "Actualizar estado FA" (`informado`, dispara replay con `payloadEnviado`).
- **Clientes mayoristas**: sección "Entrega (warehouse) y condición de venta" en la ficha: campos `entrega_*` + `plazo_dias`; indicador "datos incompletos para warehouse".
- **Asignaciones**: al completar la asignación que dispara el envío, feedback del resultado (el chip vive en la proforma).

## Testing

- Unit: `lib/wholesale-validation.ts` (CUIT verificador, montos en centavos, elegibilidad de IMEIs, delivery/provincia, límites) y `sendWholesaleWebhook` (ambos envelopes, byte-idéntico en reintentos con headers frescos).
- La migración SQL se aplica con query nombrada en el SQL Editor de Supabase antes de deployar.
- Integración real coordinada con Pedro: una proforma chica stock_local (verifica `wholesale_sales` + IMEIs `sold_wholesale` en su base — tenemos lectura) y una andreani_wh (verifica `andreani_wholesale_dispatches`). Confirmar en la prueba: gross con IVA, y el `gocuotas_store_id` correcto de cada cliente ANTES de la primera real (pendiente conocido de la doc).

## Fuera de alcance

- Polling automático del estado de Factura A (el botón manual de replay alcanza).
- Panel de ventas mayoristas informadas (los datos quedan en `proformas.gocelular` si se quiere después).
