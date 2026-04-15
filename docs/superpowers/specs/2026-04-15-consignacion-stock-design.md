# Sistema de Control de Stock en Consignación — GOcelular
**Fecha:** 2026-04-15  
**Estado:** Aprobado por el usuario

---

## 1. Resumen ejecutivo

Sistema web (Next.js 14 + Supabase + PWA) para controlar el stock de celulares entregados en consignación a vendedores externos. Cada equipo se rastrea individualmente por IMEI desde que sale del depósito hasta que se vende o se devuelve. Las ventas se sincronizan automáticamente desde la base de datos de Gocuotas (T-1). Las diferencias de inventario (equipos no vendidos ni presentes) generan deudas automáticas al consignatario por el precio de venta. Todos los eventos de asignación y auditoría quedan respaldados por firma digital y PDF.

---

## 2. Contexto y problema

- Los celulares se entregan en consignación a vendedores externos (consignatarios).
- Solo se puede vender a través de Gocuotas — cualquier equipo no vendido por Gocuotas y que no esté físicamente presente es responsabilidad del consignatario.
- El tracking por IMEI impide que un consignatario devuelva un equipo diferente al recibido.
- Las diferencias de inventario (robos principalmente) son el riesgo central del modelo de negocio.
- El sistema arranca con 4 consignatarios y ~100 equipos cada uno, con proyección de crecimiento 10x en 12 meses.

---

## 3. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Next.js API Routes |
| Base de datos | Supabase (PostgreSQL + RLS + Auth) |
| Storage | Supabase Storage (firmas + PDFs) |
| Sync ventas | Vercel Cron Job (T-1, 6:00am) |
| PDF | @react-pdf/renderer (server-side) |
| Firma digital | react-signature-canvas (canvas HTML5) |
| Mobile | PWA via next-pwa (instalable desde Chrome/Safari) |
| Deploy | Vercel |

---

## 4. Modelo de datos

### 4.1 Tablas principales

#### `config`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| multiplicador | NUMERIC | Multiplicador global de precio (ej: 1.8). precio_venta = precio_costo × multiplicador |
| updated_at | TIMESTAMPTZ | — |

**Una sola fila.** El admin puede editarlo desde el panel. Al cambiar, el precio_venta de todos los modelos se recalcula automáticamente en tiempo real (calculado, no almacenado).

---

#### `consignatarios`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| nombre | TEXT | — |
| owner_id | TEXT | ID en Gocuotas para consultar ventas |
| store_id | TEXT | ID de tienda en Gocuotas |
| email | TEXT | Para autenticación |
| telefono | TEXT | — |
| punto_reorden | INTEGER | Umbral de alerta de stock mínimo |
| comision_porcentaje | NUMERIC | % de comisión sobre ventas (ej: 0.10 = 10%) |
| user_id | UUID FK → auth.users | Cuenta Supabase del consignatario |
| created_at | TIMESTAMPTZ | — |

---

#### `modelos`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| marca | TEXT | Ej: Samsung, Motorola |
| modelo | TEXT | Ej: Galaxy A54 |
| precio_costo | NUMERIC | Costo de adquisición. precio_venta = precio_costo × config.multiplicador |
| created_at | TIMESTAMPTZ | — |

**UNIQUE(marca, modelo).** El precio_venta no se almacena — se calcula al consultar.

---

#### `dispositivos`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| imei | TEXT UNIQUE | 15 dígitos, validado al ingresar |
| modelo_id | UUID FK → modelos | — |
| estado | ENUM | `disponible` · `asignado` · `vendido` · `devuelto` |
| consignatario_id | UUID FK → consignatarios | NULL si disponible |
| created_at | TIMESTAMPTZ | — |

**Carga masiva:** CSV con columnas `imei, marca, modelo`. El sistema valida formato IMEI, detecta duplicados y muestra errores por línea.

---

#### `asignaciones`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| consignatario_id | UUID FK | — |
| fecha | DATE | — |
| total_unidades | INTEGER | — |
| total_valor_costo | NUMERIC | Suma de precios_costo de los IMEIs asignados |
| total_valor_venta | NUMERIC | total_valor_costo × multiplicador al momento de asignación |
| firmado_por | TEXT | Nombre del receptor (consignatario) |
| firma_url | TEXT | URL en Supabase Storage (imagen base64) |
| documento_url | TEXT | URL del PDF generado |
| created_at | TIMESTAMPTZ | — |

---

#### `asignacion_items`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| asignacion_id | UUID FK → asignaciones | — |
| dispositivo_id | UUID FK → dispositivos | — |

---

#### `ventas`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| dispositivo_id | UUID FK → dispositivos | — |
| consignatario_id | UUID FK → consignatarios | — |
| fecha_venta | DATE | Fecha en Gocuotas |
| precio_venta | NUMERIC | Precio registrado en Gocuotas |
| comision_monto | NUMERIC | precio_venta × consignatario.comision_porcentaje |
| gocuotas_sale_id | TEXT | ID externo para deduplicación |
| synced_at | TIMESTAMPTZ | Cuándo fue procesada |

---

#### `auditorias`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| consignatario_id | UUID FK | — |
| realizada_por | TEXT | Nombre del miembro del equipo GOcelular |
| fecha | DATE | — |
| estado | ENUM | `borrador` · `confirmada` |
| firma_url | TEXT | URL firma del auditor en Supabase Storage |
| documento_url | TEXT | URL del PDF generado |
| observaciones | TEXT | — |
| created_at | TIMESTAMPTZ | — |

---

#### `auditoria_items`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| auditoria_id | UUID FK → auditorias | — |
| dispositivo_id | UUID FK → dispositivos | — |
| presente | BOOLEAN | Si el IMEI fue encontrado físicamente |
| observacion | TEXT | — |

---

#### `diferencias`
| Campo | Tipo | Descripción |
|---|---|---|
| id | UUID PK | — |
| auditoria_id | UUID FK → auditorias | — |
| dispositivo_id | UUID FK → dispositivos | — |
| tipo | ENUM | `faltante` · `sobrante` |
| estado | ENUM | `pendiente` · `cobrado` · `resuelto` |
| monto_deuda | NUMERIC | precio_venta al momento de la auditoría (precio_costo × multiplicador) |
| created_at | TIMESTAMPTZ | — |

---

### 4.2 Lógica de diferencias

Al confirmar una auditoría, un trigger/función de Supabase calcula:

```
diferencias = dispositivos ASIGNADOS al consignatario
            − dispositivos VENDIDOS en gocuotas
            − dispositivos PRESENTES en auditoria_items
```

Cada IMEI resultante genera un registro en `diferencias` con:
- `tipo = faltante`
- `monto_deuda = modelo.precio_costo × config.multiplicador`
- `estado = pendiente`

---

## 5. Pantallas

### Panel Admin (GOcelular)
1. **Dashboard global** — KPIs: total / disponible / asignado / vendido / valor total. Alertas de punto de reorden por consignatario.
2. **Inventario de dispositivos** — Lista todos los IMEIs con filtros por estado, modelo y consignatario. Carga masiva por CSV.
3. **Asignar stock** — Seleccionar consignatario → escanear/ingresar IMEIs → preview del documento → firma digital del consignatario → PDF generado automáticamente.
4. **Consignatarios** — CRUD de consignatarios (con comisión y punto de reorden). Stock actual, historial de asignaciones, deudas pendientes.
5. **Auditorías** — Nueva auditoría → verificar IMEIs presentes → detectar faltantes automáticamente → firma del auditor → PDF.
6. **Sync Gocuotas** — Log del último sync T-1, estado de cada match de IMEI, trigger manual disponible.
7. **Diferencias / Deudas** — Lista de IMEIs faltantes por consignatario con estado de cobro.
8. **Modelos y precios** — CRUD de modelos con precio_costo. Campo para editar el multiplicador global.
9. **Reportes** — Rotación por modelo, rendimiento por consignatario, historial de diferencias.

### Panel Consignatario
1. **Mi stock** — Lista de sus IMEIs asignados con estado y modelo.
2. **Control de inventario** — Inicia conteo → confirma IMEIs presentes → envía al admin para cerrar la auditoría.
3. **Mis ventas** — Ventas T-1 de Gocuotas (solo lectura) con precio de venta.
4. **Comisiones a facturar** — Ventas del período × comision_porcentaje = monto a facturar. Exportable a PDF/CSV.
5. **Recibos de asignación** — Historial de entregas con PDF descargable de cada remito firmado.
6. **Diferencias** — Sus IMEIs con diferencia detectada y el monto a saldar.

---

## 6. Flujos principales

### Asignación de stock
1. Admin selecciona consignatario
2. Ingresa IMEIs (manual o carga CSV)
3. Sistema valida: IMEI existe, estado = disponible
4. Preview del remito (lista IMEIs + totales)
5. Consignatario firma en canvas (touch/mouse)
6. Se genera PDF y se guarda en Supabase Storage
7. Dispositivos pasan a estado `asignado`, `consignatario_id` asignado
8. Se crea registro en `asignaciones` + `asignacion_items`

### Sync de ventas (diario, 6:00am)
1. Vercel Cron invoca `/api/sync-ventas`
2. Conecta a DB de GOcelular (PostgreSQL, read-only)
3. Consulta órdenes de venta nuevas desde el último sync, con IMEI y consignatario
4. Por cada registro: busca el IMEI en `dispositivos`
5. Marca dispositivo como `vendido`, asigna `consignatario_id`
6. Crea registro en `ventas` con `comision_monto` calculada
7. Log del resultado guardado para revisión admin

### Auditoría física
1. Admin inicia auditoría para un consignatario
2. Ingresa miembro del equipo que la realiza
3. Para cada IMEI asignado al consignatario: marca presente/ausente
4. Al confirmar: función calcula diferencias automáticamente
5. Auditor firma en canvas
6. Se genera PDF con lista de IMEIs verificados + diferencias + firma
7. Diferencias generan registros con `monto_deuda = precio_venta`

### Control de inventario (consignatario)
1. Consignatario inicia conteo desde su panel
2. Ve su lista de IMEIs asignados
3. Confirma cuáles tiene físicamente
4. Envía reporte al admin (queda en estado `borrador`)
5. Admin revisa, completa la auditoría formal y firma

---

## 7. Autenticación y seguridad

- **Supabase Auth** con dos roles: `admin` y `consignatario`
- **RLS** en todas las tablas: consignatarios solo ven sus propios registros
- Admin crea cuenta del consignatario — recibe email con contraseña temporal
- Rutas Next.js protegidas por middleware según rol

---

## 8. Firma digital y documentos

- **Captura:** `react-signature-canvas` — canvas HTML5, funciona con mouse y touch
- **Storage:** imagen PNG guardada en Supabase Storage bajo `/firmas/{id}.png`
- **PDF:** generado server-side con `@react-pdf/renderer`
  - Asignaciones: remito con datos del consignatario, lista de IMEIs, totales, fecha y firma
  - Auditorías: lista de IMEIs verificados, diferencias detectadas, datos del auditor y firma
- **URL:** guardada en `firma_url` y `documento_url` del registro correspondiente

---

## 9. Precios

- `config.multiplicador` — valor global editable por el admin (ej: 1.8)
- `modelos.precio_costo` — costo de adquisición por modelo
- `precio_venta unitario` — calculado en tiempo real: `precio_costo × multiplicador`, **no se almacena en ninguna tabla como valor vivo**
- **Excepción — snapshots históricos:** los valores de precio_venta sí se almacenan como foto al momento de cada transacción para que cambios futuros del multiplicador no alteren el historial:
  - `asignaciones.total_valor_venta` — valor de venta total al momento de la asignación
  - `diferencias.monto_deuda` — precio_venta al momento de la auditoría

---

## 10. Carga masiva de IMEIs

CSV con columnas: `imei, marca, modelo`

- El sistema busca el modelo por `(marca, modelo)` en la tabla `modelos`. Si no existe, lo crea con `precio_costo = 0` — el admin debe actualizarlo en la pantalla de Modelos antes de usar ese modelo en asignaciones
- Valida formato IMEI (15 dígitos numéricos)
- Detecta duplicados contra la tabla `dispositivos`
- Muestra resultado línea por línea: éxito / error con descripción
- Los dispositivos se crean en estado `disponible`

---

## 11. Deploy y configuración

- **Vercel** — deploy automático desde GitHub
- **Variables de entorno:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOCELULAR_DB_URL`
- **Cron:** configurado en `vercel.json` → `/api/sync-ventas` a las 6:00am diario + `/api/auditoria-mensual` el primer día hábil de cada mes
- **PWA:** `next-pwa` para instalación desde Chrome (Android) y Safari (iOS)

---

## 12. Estructura del proyecto

```
consignacion-app/
├── app/
│   ├── (admin)/
│   │   ├── dashboard/
│   │   ├── inventario/
│   │   ├── asignar/
│   │   ├── consignatarios/
│   │   ├── auditorias/
│   │   ├── diferencias/
│   │   ├── modelos/
│   │   ├── sync/
│   │   └── reportes/
│   ├── (consignatario)/
│   │   ├── stock/
│   │   ├── inventario/
│   │   ├── ventas/
│   │   ├── comisiones/
│   │   ├── recibos/
│   │   └── diferencias/
│   └── api/
│       ├── sync-gocuotas/
│       └── pdf/
├── components/
│   ├── firma/
│   ├── pdf/
│   └── ui/
├── lib/
│   ├── supabase.ts
│   └── gocuotas.ts
└── supabase/
    └── schema.sql
```

---

## 13. Decisiones resueltas

### Sync de ventas — fuente de datos
El cron job consulta la **base de datos de GOcelular** (PostgreSQL, acceso read-only con credenciales a solicitar), no la de Gocuotas directamente. GOcelular ya tiene un registro de órdenes de venta vinculadas a IMEI y al vendedor (consignatario). El mapeo exacto de tablas y campos se define una vez obtenidas las credenciales. La variable de entorno `GOCUOTAS_DB_URL` del spec original pasa a llamarse `GOCELULAR_DB_URL`.

### Firma del consignatario
El consignatario firma **en el dispositivo del operador GOcelular** al momento de la entrega (ya sea en el depósito o en el local del consignatario). La firma es un **paso bloqueante**: no se puede confirmar la asignación sin completarla. Una vez firmado, el remito queda visible en el panel del consignatario como solo lectura.

### Periodicidad de auditorías / controles de inventario
Ciclo **mensual**, alineado al período de pago. El sistema dispara automáticamente una auditoría el **primer día hábil de cada mes** (vía Vercel Cron). El admin también puede crear auditorías **ad-hoc** en cualquier momento para controles sorpresa, o ante bajas, altas o modificaciones de consignatarios. El cierre de cada auditoría mensual determina lo que se le paga al consignatario (comisiones) o lo que se le descuenta (diferencias de stock).
