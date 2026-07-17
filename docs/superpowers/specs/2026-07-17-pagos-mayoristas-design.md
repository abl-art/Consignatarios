# Pagos Mayoristas — Design Spec

**Fecha**: 2026-07-17
**Estado**: Aprobado

## Resumen

Sistema de asentamiento rápido de pagos mayoristas mediante extracción automática de datos de comprobantes (echeq, orden de pago, transferencia) usando IA (Claude Vision). Los pagos se integran a la Cuenta Corriente como "Haber" y al Flujo de Fondos como ingreso en la fecha de cobro. Incluye panel de exposición al riesgo con límites de cuenta corriente por cliente.

## Modelo de datos

### Tabla `pagos_mayoristas` (Supabase)

| Campo | Tipo | Restricción | Descripción |
|---|---|---|---|
| `id` | UUID | PK, default gen_random_uuid() | |
| `cliente_mayorista_id` | UUID | FK → clientes_mayoristas, NOT NULL | Cliente al que se le asienta el pago |
| `monto` | numeric | NOT NULL | Monto del pago |
| `fecha_cobro` | date | NOT NULL | Fecha efectiva de cobro |
| `cuit_emisor` | text | NOT NULL | CUIT extraído del comprobante |
| `tipo` | text | NOT NULL | 'echeq' \| 'transferencia' \| 'efectivo' \| 'orden_pago' |
| `comprobante_url` | text | NULL si entrada manual | URL de la imagen en Supabase Storage |
| `confianza_extraccion` | numeric | NULL si entrada manual | Score 0-1 de confianza de la IA |
| `created_at` | timestamptz | default now() | |

### Campo nuevo en `clientes_mayoristas`

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `limite_cuenta_corriente` | numeric | NULL | Límite de CC. NULL = sin límite |

### Storage

- Bucket: `comprobantes-mayoristas`
- Naming: `{cliente_mayorista_id}/{timestamp}.{ext}`

## Flujo de usuario — Pestaña "Asentar Pagos"

### Paso 1: Subir imagen
Botón o drag & drop para subir foto/captura del comprobante (echeq, orden de pago, transferencia). También permite entrada 100% manual sin imagen.

### Paso 2: Extracción automática
Se envía la imagen a `/api/extraer-pago` (API route de Next.js). El server llama a Claude Vision con un prompt estructurado. Extrae:
- **Monto**
- **Fecha de cobro**
- **CUIT del emisor**
- **Score de confianza** (0-1)

### Paso 3: Resolución del cliente
Con el CUIT extraído se busca en `clientes_mayoristas.cuit`:
- **Match único**: Pre-selecciona cliente automáticamente
- **Sin match**: Warning "CUIT no encontrado" + dropdown manual
- **CUIT no detectado**: Formulario manual con dropdown de clientes

### Paso 4: Confirmación condicional
- Confianza >= 0.85 → asentar directo, toast de éxito con datos
- Confianza < 0.85 → formulario editable para confirmar/corregir

### Paso 5: Validación de límite
Antes de asentar, se verifica si el cliente tiene `limite_cuenta_corriente` configurado. Si el saldo actual (deuda - pagos) supera el límite, se informa pero **el pago se asienta igual** (el bloqueo aplica a nuevas proformas, no a pagos).

### Paso 6: Guardado
1. Subir imagen a Supabase Storage (`comprobantes-mayoristas`)
2. Insertar fila en `pagos_mayoristas`
3. Automáticamente visible en:
   - Cuenta Corriente → fila "Haber"
   - Flujo de Fondos → columna `in_mayoristas` en la `fecha_cobro`

### Tipo de pago
Dropdown con opciones: echeq, transferencia, efectivo, orden de pago.
- Para transferencia/efectivo, `fecha_cobro` = fecha actual por defecto
- Para echeq/orden_pago, `fecha_cobro` debe ser ingresada o extraída

## Pestaña "Exposición al Riesgo"

### Vista principal
Tabla con una fila por cliente mayorista:

| Columna | Descripción |
|---|---|
| **Cliente** | nombre_comercial |
| **Límite CC** | limite_cuenta_corriente o "Sin límite" |
| **Deuda** | Suma de proformas confirmadas (debe) |
| **Pagos acreditados** | Pagos con fecha_cobro <= hoy |
| **Pendiente de cobro** | Pagos con fecha_cobro > hoy |
| **Saldo** | Deuda - Pagos acreditados - Pendiente de cobro |
| **% Utilización** | Saldo / Límite CC (barra visual) |
| **Estado** | Semáforo: verde (<70%), amarillo (70-90%), rojo (>90%), negro (bloqueado >=100%) |

### Funcionalidades
- Ordenar por cualquier columna
- Filtrar por estado (verde/amarillo/rojo/bloqueado)
- Click en cliente expande detalle con echeqs pendientes (monto, fecha_cobro, días restantes)

### Bloqueo de proformas
Al intentar confirmar una proforma (`confirmarProforma()`), se verifica:
1. ¿El cliente tiene `limite_cuenta_corriente`?
2. ¿El saldo actual + monto de la proforma supera el límite?
3. Si sí → rechazar confirmación con mensaje: "Cliente X excede su límite de cuenta corriente ($saldo/$limite)"

## Integración con Cuenta Corriente

Cambios en `CuentaCorrienteClient.tsx`:
- Consultar `pagos_mayoristas` del cliente seleccionado
- Agregar filas "Haber" intercaladas por fecha con las filas "Debe" existentes
- Saldo acumulado: `saldo = saldo_anterior + debe - haber`
- Visual: filas haber en verde

## Integración con Flujo de Fondos

### Cambios en `lib/actions/finanzas.ts`
- Nueva función `fetchPagosMayoristasParaFlujo()`: agrupa pagos por `fecha_cobro`, suma montos por día
- Agregar campo `in_mayoristas` al tipo `FlujoDiario`
- Sumar al `net_flow` y `cash_balance`

### Cambios en UI
- Nueva columna abreviada **"May"** en la tabla de flujo de fondos
- Columna estrecha para no afectar el layout existente

## API Route — Extracción de imagen

### Endpoint: `POST /api/extraer-pago`

**Request**: FormData con campo `imagen` (archivo)

**Procesamiento**:
1. Leer imagen del FormData
2. Convertir a base64
3. Llamar a Claude Vision (Anthropic API) con prompt estructurado:
   - Extraer: monto, fecha_cobro, CUIT
   - Devolver JSON + score de confianza
4. Devolver resultado

**Response**:
```json
{
  "monto": 1500000,
  "fecha_cobro": "2026-08-15",
  "cuit_emisor": "30-71234567-9",
  "confianza": 0.92,
  "tipo_detectado": "echeq"
}
```

**Config**: `ANTHROPIC_API_KEY` como env var.

## Navegación

- Card "Pagos" en `/mayoristas/clientes/` → habilitada, sin badge "Próximamente"
- href: `/mayoristas/clientes/pagos`
- Estilo: card con header de color + ícono SVG (consistente con Compras)
- Dentro: dos tabs — "Asentar Pago" y "Exposición al Riesgo"

## Decisiones de diseño

1. **Pagos sin estados**: Un pago asentado es un hecho. La exposición al riesgo se maneja con la vista dedicada, no con estados en el pago.
2. **Bloqueo duro en proformas**: El límite de CC bloquea la confirmación de nuevas proformas, no el asentamiento de pagos.
3. **Confianza threshold 0.85**: Por encima se asienta directo, por debajo se pide confirmación.
4. **Claude Vision**: Extracción server-side via API route, API key segura en env var.
5. **Columna "May" abreviada**: Para no romper el layout del flujo de fondos.
