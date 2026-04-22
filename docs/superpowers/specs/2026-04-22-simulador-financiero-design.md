# Simulador Financiero de Productos GOcelular — Spec

## Contexto

GOcelular quiere ofrecer financiación a comercios terceros: el consumidor compra en cuotas sin interés, GOcelular financia y liquida al comercio en plazos configurables cobrando una tasa de descuento. Se necesita un simulador para evaluar la rentabilidad de cada producto financiero, armar la lista de precios, y tener una herramienta de simulación libre para reuniones con clientes.

## Modelo de negocio

1. El consumidor compra por $X en un comercio tercero
2. Paga un down payment (%) + N cuotas mensuales sin interés
3. GOcelular le liquida al comercio el monto menos la tasa de descuento, en plazos configurables con splits porcentuales
4. GOcelular cobra las cuotas del consumidor a lo largo de los meses
5. El spread entre cuotas cobradas y liquidación al comercio es el ingreso bruto

## Ubicación en la app

Dos pestañas nuevas en Finanzas:
- **"Productos y Simulación"** — Simulador + productos guardados
- **"Lista de Precios"** — Matriz cuotas x estructura de liquidación

## Parámetros del simulador

### Operación
| Parámetro | Tipo | Ejemplo |
|-----------|------|---------|
| Order amount (ticket promedio) | $ | 150.000 |
| Down payment | % | 10% |
| Cantidad de cuotas al consumidor | número | 6 |
| Cantidad de operaciones/mes | número por mes | [500, 500, 500, ...] o 1 para op individual |
| Tasa de descuento al comercio | % | 15% |

### Liquidación al comercio
| Parámetro | Tipo | Ejemplo |
|-----------|------|---------|
| Cantidad de splits | número | 3 |
| Por cada split: plazo (días) | número | 7, 30, 60 |
| Por cada split: porcentaje | % | 40%, 30%, 30% (suma = 100%) |

### Costos
| Parámetro | Tipo | Ejemplo |
|-----------|------|---------|
| Costo de financiación (TNA) | % | 45% |
| Costos operativos (% sobre operación) | % | 2% |
| Imp. créditos | % | 0.6% |
| Imp. débitos | % | 0.6% |
| IIBB (% sobre venta neta) | % | 4% |

### Estocástico (incobrabilidad y mora)
| Parámetro | Tipo | Ejemplo |
|-----------|------|---------|
| Incobrabilidad media | % | 3% |
| Incobrabilidad desvío | % | 1.5% |
| Mora media (días de atraso) | días | 15 |
| Mora desvío | días | 7 |

**Toggle**: Determinístico (usa medias fijas) / Estocástico (corre N simulaciones con distribución normal sobre incobrabilidad y mora).

## Motor de cálculo

### Flujo de una operación individual

No existe Mes 0. Todo arranca en Mes 1.

**Mes 1:**
- (+) Cobro cuota 1 (siempre se paga, no se aplica incobrabilidad)
- (+) Down payment
- (-) Liquidación al comercio: splits que caigan en este período
- (-) Costos operativos
- (-) Imp. débitos sobre liquidación al comercio
- (-) IIBB sobre venta neta

**Mes 2 a N:**
- (+) Cobro cuota (monto cuota * (1 - incobrabilidad))
- (-) Liquidación splits que caigan en este período
- (-) Imp. créditos sobre cobro cuota
- (-) Costo de financiación: saldo acumulado negativo del mes anterior * TNA/12

**Filas del flujo:**
- Cobro cuota
- Down payment (solo mes 1)
- Liquidación comercio (por split)
- Costo operativo
- Imp. créditos
- Imp. débitos
- IIBB
- Incobrabilidad (reducción sobre cuota, desde cuota 2)
- Costo financiación (sobre saldo negativo acumulado)
- **Subtotal mes**
- **Acumulado**

**Columnas**: Mes 1, Mes 2, ..., Mes N (donde N = cantidad de cuotas)

### Flujo agregado (volumen)

Misma lógica pero cada mes se suman las operaciones nuevas. Las cobranzas de meses anteriores se acumulan. El flujo crece hasta estabilizarse cuando las cobranzas compensan los desembolsos.

### Modo estocástico

- Corre 500 simulaciones del mismo flujo
- En cada simulación, la incobrabilidad de cada cuota (desde la 2) se sortea con distribución normal (media, desvío)
- La mora agrega días de atraso aleatorios al cobro de cuotas
- El flujo muestra bandas: percentil 10 / mediana / percentil 90
- Los indicadores muestran rango

### Indicadores

| Indicador | Descripción |
|-----------|-------------|
| TIR mensual | Tasa interna de retorno del flujo mensual |
| TIR anualizada | (1 + TIR mensual)^12 - 1 |
| VAN | Valor actual neto descontado a la tasa de financiación |
| Máximo endeudamiento | Pico negativo del acumulado (capital a financiar) |
| Payback | Mes en que el acumulado se vuelve positivo |
| Rentabilidad sobre capital | Resultado final / máximo endeudamiento |
| Margen neto por operación | Resultado final / cantidad de operaciones |

En modo estocástico cada indicador muestra: P10 / Mediana / P90.

## Persistencia

### Tabla `productos_financieros`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| nombre | text NOT NULL | Auto-generado: "6 cuotas - Liq 40/30/30 a 7/30/60d - DP 10%" |
| parametros | jsonb NOT NULL | Todos los parámetros del simulador en JSON |
| indicadores | jsonb NOT NULL | TIR, VAN, max endeudamiento, payback, etc. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: admin_all policy (mismo patrón que las demás tablas).

### Auto-generación de nombre

Formato: `"{cuotas} cuotas - Liq {%1}/{%2}/... a {d1}/{d2}/...d - DP {dp}%"`

Ejemplos:
- "6 cuotas - Liq 100% a 30d - DP 0%"
- "12 cuotas - Liq 40/30/30 a 7/30/60d - DP 10%"

### Botón "Guardar"

Sin modal. Se genera el nombre automáticamente, se persiste en DB, se agrega a la lista de productos guardados y queda disponible en la lista de precios.

## Pestaña "Productos y Simulación"

### Layout

**Panel superior izquierdo: Parámetros**
- Campos editables agrupados: Operación, Liquidación, Costos, Estocástico
- Toggle Determinístico/Estocástico
- Botón "Guardar" (persiste como producto)
- Al cambiar cualquier parámetro se recalcula instantáneamente

**Panel superior derecho: Indicadores**
- Cards con TIR, VAN, Máx endeudamiento, Payback, Rentabilidad, Margen neto
- En modo estocástico: cada card muestra P10 / Mediana / P90

**Panel inferior: Tabla del flujo**
- Filas: cada concepto (cobro cuota, liquidación, costos, subtotal, acumulado)
- Columnas: Mes 1 a Mes N
- Formato compacto (M/K)
- En modo estocástico: valores con bandas (P10 | mediana | P90)

### Productos guardados (debajo)

Lista colapsable con los productos persistidos. Click en uno → carga sus parámetros en el simulador.

## Pestaña "Lista de Precios"

Matriz de doble entrada auto-generada desde productos guardados:

- **Filas**: cantidad de cuotas (3, 6, 9, 12...)
- **Columnas**: estructura de liquidación (cada combinación única de splits/plazos)
- **Celda**: tasa de descuento al comercio

Celdas vacías si no existe un producto guardado para esa combinación. Header de columna muestra la estructura de splits (ej: "40/30/30 a 7/30/60d").

## Archivos a crear/modificar

### Nuevos
- `lib/simulador.ts` — Motor de cálculo: TIR, VAN, flujo determinístico, flujo estocástico
- `app/(admin)/finanzas/SimuladorTab.tsx` — Pestaña completa (parámetros + indicadores + flujo + productos)
- `app/(admin)/finanzas/ListaPreciosTab.tsx` — Matriz de doble entrada
- `supabase/migrations/20260422_create_productos_financieros.sql`

### Modificar
- `supabase/schema.sql` — Agregar tabla productos_financieros
- `lib/actions/deuda.ts` o nuevo `lib/actions/productos.ts` — CRUD productos_financieros
- `app/(admin)/finanzas/page.tsx` — Agregar pestañas y fetches
- `app/(admin)/finanzas/FinanzasTabs.tsx` — Solo agregar tabs al array

## Backlog relacionado
- Curva de incobrabilidad por número de cuota (cuando haya datos históricos, reemplazar incobrabilidad proporcional por curva real)
- Monte Carlo completo (simulación de riesgo de portfolio con correlaciones entre variables)
