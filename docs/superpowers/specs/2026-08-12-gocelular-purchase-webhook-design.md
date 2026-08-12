# Integración: webhook de compras a GOcelular desde el gestor

**Fecha:** 2026-08-12 · **Estado:** diseño aprobado, pendiente de implementación

## Contexto

GOcelular expone un webhook nuevo (`POST https://gocelular.gocuotas.com/api/webhooks/gocelular/purchase`, spec en `gocelular-purchase-webhook.md` de Pedro) para que nuestro gestor de compras le informe cada compra a proveedor. Reemplaza el traspaso manual del Excel de IMEIs. Al recibirlo, GOcelular crea lotes de intake y, si el destino es `andreani_wh`, encola el ASN automático hacia el warehouse de Andreani.

Ventaja clave nuestra: tenemos acceso de **lectura directa a la base de GOcelular** (`GOCELULAR_DB_URL`), lo que permite pre-validar todo el payload contra sus propios catálogos antes de enviar.

## Decisiones tomadas (con Emiliano, 2026-08-12)

| Decisión | Elección |
| --- | --- |
| Enfoque general | **B: pre-validación local contra tablas de GOcelular + envío** (vs. cliente mínimo o cola con worker) |
| Disparo (pedidos con celulares) | **Automático al subir el Excel de IMEIs** |
| Disparo (pedidos solo accesorios) | **Botón manual** "Informar a GOcelular" |
| Destino | Campo `destino` en el pedido, **default `andreani_wh`**, editable al armar el pedido |
| Secret HMAC | Variable de entorno; **pendiente: Pedro debe pasar el secret real** (el de consignación NO valida — probado 2026-08-12 contra wholesale y purchase, ambos 401) |
| Costo de celulares | Best-effort: se manda `unit_cost` solo si el mapeo Excel-SKU → ítem del pedido es inequívoco; si no, se omite (la spec lo permite) |

## Hechos verificados contra la base de GOcelular

- El endpoint ya existe de su lado: tabla `purchase_intakes` (0 filas — seremos los primeros).
- SKUs de device se resuelven contra `device_model_skus` (31 filas, SKU fabricante → `model_code`, con `ean` y flag `active`). Addons contra `store_products` (`is_addon = true`).
- `suppliers` tiene duplicados groseros (4 variantes de SYNA incl. typo "SYNS S.A", 4 de NEWSAN, 2 MIRGOR, "MULIPOINT"), todos activos. El match del webhook es trim + case-insensitive exacto → hay que fijar el nombre canónico exacto por proveedor y pedir a GOcelular que limpie el catálogo.
- Los `codigo` del gestor son internos (`MOTO-G56-256`) y NO sirven como SKU de device. El SKU de fabricante viene en el **Excel del proveedor**, que siempre trae IMEI + EAN + SKU (confirmado por Emiliano; el resto de las columnas varía por proveedor).

## Arquitectura

Dos módulos nuevos + cambios acotados en el gestor:

### 1. `lib/gocelular-webhook.ts` — cliente puro del webhook

- Tipos del payload (`PurchasePayload`, `PurchaseLine`) y de la respuesta (`PurchaseResponse`, envelope de error).
- `signWebhook(secret, timestampIso, rawBody)`: HMAC-SHA256 de `timestamp + "." + rawBody`, hex minúscula.
- `sendPurchaseWebhook(payload)`: serializa **una sola vez** (el raw body firmado es el que se envía, byte a byte), POST con headers `X-Gocelular-Signature` / `X-Gocelular-Timestamp` (ISO-8601 con offset `-03:00`).
- Reintentos: solo ante timeout, 5xx o `503 integration_disabled` — backoff 2s/4s/8s, máx. 3 intentos. En cada reintento el **body va idéntico** y los **headers de auth se recalculan** (timestamp fresco). 4xx/409 nunca se reintentan.
- Env vars: `GOCELULAR_WEBHOOK_SECRET`, `GOCELULAR_WEBHOOK_URL` (default a la URL de producción).
- Sin dependencias del gestor: testeable solo y reusable para el webhook mayorista (fase 2).

### 2. `lib/actions/purchase-webhook.ts` — orquestador (server action)

Pipeline `informarCompraGocelular(pedidoId)`:

1. **Parsear el Excel de IMEIs** (si el pedido tiene celulares). Detección de columnas por contenido, no por posición ni encabezado: IMEI = 15 dígitos que pasan Luhn; EAN = 13 dígitos; SKU = columna restante cuyos valores matcheen `device_model_skus` (consulta a la base de GOcelular). Agrupar IMEIs por SKU → líneas `device`.
2. **Armar líneas addon** desde los ítems del pedido con categoría ≠ "Celulares": `sku` = `productoCodigo`, `quantity` = cantidad, `unit_cost` = precio (obligatorio para addons según la spec).
3. **Pre-validar TODO contra las tablas de GOcelular**, juntando todos los errores en una pasada (no de a uno):
   - Proveedor: exactamente un `suppliers.name` activo que matchee (trim + case-insensitive).
   - SKUs device: existen y activos en `device_model_skus`. SKU sin match → *warning* (será `pending_alias`, no bloquea); SKU inactivo → **error** (rechazaría la compra completa).
   - SKUs addon: existen en `store_products` (mismo criterio warning/error).
   - IMEIs: 15 dígitos, Luhn, sin duplicados en el payload, y **no existentes ya en `inventory_items`** (un solo query con `= ANY($1)`).
   - Límites: ≤ 200 líneas, ≤ 5000 unidades totales, ≤ $500M agregado, ≤ $100M por línea, `quantity` de device = cantidad de IMEIs de la línea.
   - Formato de montos: string decimal `^\d+(\.\d{1,2})?$`.
4. Si hay **errores** → NO se envía; se persisten en el pedido como `validacion_fallida` con la lista en español accionable. Los *warnings* (futuros `pending_alias`) no bloquean.
5. **Enviar** con el cliente del punto 1. `purchase_reference` = `pedido.id`, `supplier` = nombre canónico, `destination` = `pedido.destino`, `timestamp` = ISO del momento (excluido del hash de idempotencia por `canonicalHashV2`, regenerable en reintentos).
6. **Persistir resultado** en el pedido (ver modelo) y `revalidatePath`.

`unit_cost` de devices (best-effort): mapear SKU del Excel → `device_model_skus.model_code` → `device_models.name` → match contra `productoNombre` del pedido; si el pedido tiene un solo modelo de celular, mapeo directo. Sin certeza → omitir el campo.

### 3. Cambios en el modelo `Pedido` (sigue en `flujo_config`, sin migración)

```ts
destino: 'andreani_wh' | 'local'          // default 'andreani_wh'
gocelular?: {
  estado: 'no_enviado' | 'validacion_fallida' | 'error_reintentable' | 'rechazado' | 'informado'
  purchaseId?: string
  requestId?: string
  enviadoAt?: string
  batches?: { type: string; lines: number; units: number }[]
  pendingAliases?: { lineReference: string; sku: string }[]
  errores?: string[]                       // pre-validación local o errors[] de GOcelular traducidos
  codigoError?: string                     // code del envelope si rechazó GOcelular
}
```

Pedidos existentes sin `destino` se tratan como `andreani_wh` (el default elegido).

### 4. UI en el gestor (`GestorClient.tsx`)

- **Selector "Destino"** al armar el pedido: "Warehouse Andreani" (preseleccionado) / "Local".
- **Chip de estado** de la integración en la tarjeta del pedido:
  - ⚪ Sin informar
  - 🔴 Validación fallida → lista de errores + botón "Revalidar y enviar"
  - 🟡 Error de envío (5xx/timeout agotó reintentos) → botón "Reintentar"
  - 🔴 Rechazado por GOcelular → `code` + errores traducidos; si es `purchase_conflict`, leyenda "ya informado con otros datos — coordinar corrección manual con GOcelular"
  - 🟢 Informado → `purchase_id`, fecha, resumen de batches, y aliases pendientes con leyenda "GOcelular los resuelve de su lado, no requiere acción"
- **Botón "Informar a GOcelular"** visible solo en pedidos sin celulares (disparo manual).
- **Reglas anti-sorpresa:** la subida del Excel nunca se bloquea por la integración (el Excel se guarda aunque la validación falle). Un pedido ya `informado` no se re-dispara al resubir el Excel; se muestra aviso.

## Manejo de errores y casos borde

| Caso | Comportamiento |
| --- | --- |
| Excel sin columnas reconocibles | `validacion_fallida`: "No pude identificar las columnas IMEI/EAN/SKU" con detalle de lo detectado |
| IMEI ya en inventario GOcelular | Se detecta en pre-validación (query a `inventory_items`), no llega al 400 |
| `400 imeis_invalid` igual llega (carrera) | No se persistió nada del lado GOcelular → mismo `purchase_reference` reenviable tras corregir; el chip lo explica |
| `409 purchase_conflict` | Nunca reintentar igual; UI pide coordinación manual |
| `503 integration_disabled` | Reintentos automáticos; si agota, `error_reintentable` con botón |
| Doble disparo simultáneo | La idempotencia de GOcelular lo hace inocuo (`idempotent_replay`); igual se deshabilita el botón durante el envío |
| Secret ausente/incorrecto (`401`) | `error_reintentable` con mensaje "revisar GOCELULAR_WEBHOOK_SECRET" — sin reintento automático (la spec lo prohíbe) |

## Testing

- **Unit — parser de Excel:** fixtures con formatos distintos por proveedor (columnas en distinto orden, encabezados distintos, columnas extra), IMEIs con y sin Luhn válido, Excel sin columnas reconocibles.
- **Unit — firma:** vector de prueba del pseudocódigo de la doc (timestamp + body conocidos → hex esperado).
- **Unit — pre-validación:** casos de proveedor duplicado/inactivo, SKU inactivo vs. sin match, IMEIs duplicados, límites.
- **Integración real:** compra de prueba chica coordinada con Pedro (avisarle antes), verificando el `purchase_intakes` de su lado y el ASN si es `andreani_wh`.
- `npx tsc --noEmit` antes de cada deploy (convención del proyecto).

## Pendientes externos (bloquean el go-live, no la implementación)

1. **Secret HMAC real** — el de consignación no valida (probado). Pedro debe pasar el secret configurado para wholesale/purchase, o generar uno nuevo (soportan dual-secret).
2. **Comunicar a GOcelular:** (a) vamos a implementar el cliente del webhook de compras; (b) pedirles limpieza del catálogo `suppliers` (duplicados SYNA/NEWSAN/MIRGOR/MULTIPOINT) y confirmar el nombre canónico por proveedor; (c) coordinar la compra de prueba.

## Fase 2 (fuera de alcance, anotado)

- Cliente del webhook de venta mayorista (modo `fulfillment: "andreani_wh"`) reusando `lib/gocelular-webhook.ts`.
- Reflejar en el gestor el estado `completed` de la compra leyendo `purchase_intakes` (cuando Andreani confirma recepción física).
