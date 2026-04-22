# Modulo de Gestion de Deuda — Spec

## Contexto

La empresa opera con una linea de credito de hasta $1.000M. El flujo de fondos puede quedar en rojo en ciertos periodos. Hoy no hay forma de gestionar la deuda ni de proyectar su impacto en el flujo. Se necesita un modulo que automatice la toma y devolucion de deuda, registre intereses como egresos, y permita anticipar dias de estres financiero.

## Tipos de deuda

### 1. Prestamo Bullet
- **Toma**: manual, aceptando sugerencia del sistema o carga directa
- **Capital**: se devuelve integramente al vencimiento
- **Intereses**: se pagan mensualmente (devengados diariamente sobre saldo capital, liquidados cada 30 dias desde la toma)
- **Plazo**: configurable en periodos de 30 dias (30, 60, 90 ... hasta 360)
- **Tasa**: fija por prestamo, tomada de `deuda_tasa_bullet` vigente al momento de la toma
- **Devolucion al vencimiento**: automatica, aparece como egreso en el flujo

### 2. Acuerdo en Descubierto
- **Toma**: automatica, cuando el sistema detecta deficit de <=7 dias
- **Capital**: se devuelve automaticamente a medida que entra liquidez (excedente sobre saldo minimo $1M)
- **Intereses**: devengados diariamente sobre saldo vivo, liquidados mensualmente
- **Plazo**: sin plazo fijo, se cancela cuando saldo_capital llega a 0
- **Tasa**: configurable globalmente en `deuda_tasa_descubierto` (se actualiza frecuentemente)

## Modelo de datos

### Tabla `deuda_prestamos`

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | uuid PK | |
| tipo | text CHECK ('bullet', 'descubierto') | |
| monto_capital | numeric NOT NULL | Capital original tomado |
| tasa_anual | numeric NOT NULL | TNA al momento de la toma (ej: 0.45 = 45%) |
| fecha_toma | date NOT NULL | |
| plazo_dias | integer | 30/60/.../360 para bullet, NULL para descubierto |
| fecha_vencimiento | date | fecha_toma + plazo_dias para bullet, NULL para descubierto |
| saldo_capital | numeric NOT NULL | Capital pendiente, se reduce con devoluciones |
| estado | text CHECK ('activo', 'cancelado') DEFAULT 'activo' | |
| created_at | timestamptz DEFAULT now() | |

### Tabla `deuda_movimientos`

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| id | uuid PK | |
| prestamo_id | uuid FK deuda_prestamos | |
| tipo | text CHECK ('toma', 'devolucion', 'interes') | |
| monto | numeric NOT NULL | |
| fecha | date NOT NULL | |
| created_at | timestamptz DEFAULT now() | |

### Configuracion en `flujo_config`

| Key | Valor ejemplo | Descripcion |
|-----|---------------|-------------|
| deuda_tasa_bullet | "0.45" | TNA vigente para nuevos bullets |
| deuda_tasa_descubierto | "0.55" | TNA vigente para descubiertos |
| deuda_limite | "1000000000" | Limite total de la linea de credito |
| deuda_saldo_minimo | "1000000" | Saldo minimo a mantener en el flujo |

### RLS

Ambas tablas: admin_all policy (mismo patron que las demas tablas).

## Motor de simulacion

Se ejecuta al cargar la pagina de Finanzas. Pasos:

### Paso 1 — Flujo base
Calcular flujo de fondos como hoy (sin deuda).

### Paso 2 — Inyectar prestamos activos
Cargar `deuda_prestamos` WHERE estado='activo' e inyectar en el flujo:
- **Bullets**: interes mensual como `out_interes`, devolucion de capital en fecha_vencimiento como `out_dev_capital`
- **Descubiertos**: interes diario acumulado en `out_interes`, devoluciones automaticas en `out_dev_capital`

### Paso 3 — Simulacion dia a dia
Recorrer el flujo hacia adelante:
- Si `cash_balance < saldo_minimo`:
  - Mirar dias siguientes para estimar duracion del deficit
  - Si <=7 dias → crear descubierto automatico (en DB), monto = deficit + llevar a saldo_minimo. Ingreso en `in_asistencia`.
  - Si >7 dias → marcar como "sugerencia bullet" (no se crea hasta aceptar)
- Si `cash_balance > saldo_minimo` y hay descubierto activo:
  - Devolver excedente sobre saldo_minimo al descubierto. Egreso en `out_dev_capital`.
  - Si saldo_capital llega a 0 → estado = 'cancelado'
- Si devolucion de bullet genera nuevo deficit → detectar y sugerir nuevo bullet

### Paso 4 — Detectar dias de estres
Dias donde saldo queda <saldo_minimo despues de toda la simulacion → marcados como "estresados".

### Paso 5 — Generar alertas
Array de alertas con tipo y datos para que el frontend muestre pop-ups.

## Integracion con flujo de fondos

Columnas del flujo afectadas:

| Movimiento | Columna en flujo | Direccion |
|-----------|-----------------|-----------|
| Toma de deuda (bullet o descubierto) | `in_asistencia` | Ingreso (+) |
| Pago de intereses | `out_interes` | Egreso (-) |
| Devolucion de capital | `out_dev_capital` (NUEVA) | Egreso (-) |

La columna `out_dev_capital` se agrega al tipo `FlujoDiario` y al calculo de `net_flow`.

Dias de estres: se marcan con fondo rojo/naranja en la tabla del flujo.

## Pestana "Deuda" en Finanzas

Nueva pestana (6ta) con 3 sub-secciones:

### Resumen (cards arriba)
- **Linea total**: $1.000M (configurable)
- **Deuda vigente**: suma saldo_capital de prestamos activos
- **Disponible**: linea - deuda vigente
- **Intereses pagados este mes**: suma movimientos tipo='interes' del mes
- Barra de progreso visual del uso de linea (verde <50%, amarillo 50-80%, rojo >80%)

### Tabla de prestamos activos
| Tipo | Monto | Tasa | Fecha toma | Vencimiento | Saldo capital | Estado |
|------|-------|------|-----------|-------------|---------------|--------|

Expandible por fila para ver movimientos (tomas, devoluciones, pagos de interes).

### Configuracion (colapsable)
- Tasa bullet vigente (editable)
- Tasa descubierto vigente (editable)
- Limite de linea (editable)
- Saldo minimo del flujo (editable)

## Pop-ups y alertas

Al cargar Finanzas, en orden de prioridad:

### 1. Pop-up descubierto (informativo)
> "Se tomo descubierto por $X del DD/MM al DD/MM. Costo estimado: $Y/dia (Z% TNA). [Entendido]"

### 2. Pop-up sugerencia bullet (requiere accion)
> "Deficit proyectado de $X por ~N dias (desde DD/MM). Sugerimos bullet:
> Monto: $X | Plazo: N dias | Tasa: Z% TNA
> Interes mensual estimado: $Y
> [Aceptar] [Rechazar]"

Al aceptar: se crea el prestamo en `deuda_prestamos` con movimiento tipo='toma', y se refresca el flujo.

### 3. Alerta limite de linea (banner)
> "Uso de linea al X% ($Y / $1.000M)" — aparece cuando uso >80%

### 4. Badge de estres
En pestana Flujo de fondos: "N dias de estres detectados en los proximos 30 dias"

## Archivos a modificar/crear

### Nuevos
- `supabase/migrations/20260422_create_deuda_tables.sql`
- `app/(admin)/finanzas/DeudaTab.tsx` — pestana completa
- `app/(admin)/finanzas/DeudaAlerts.tsx` — pop-ups y alertas

### Modificar
- `supabase/schema.sql` — agregar tablas deuda_prestamos y deuda_movimientos
- `lib/actions/finanzas.ts` — agregar motor de simulacion, CRUD de prestamos, config de tasas
- `lib/types.ts` — agregar tipos de deuda
- `app/(admin)/finanzas/page.tsx` — agregar fetch de deuda, pasar alertas, agregar tab
- `app/(admin)/finanzas/FinanzasTabs.tsx` — agregar tab "Deuda"
- Tabla del flujo de fondos — agregar columna `out_dev_capital`, marcar dias de estres
