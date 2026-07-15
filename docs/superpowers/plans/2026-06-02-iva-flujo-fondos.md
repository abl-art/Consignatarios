# IVA en Flujo de Fondos + Tarjeta Finanzas - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar el saldo mensual de IVA (credito - debito fiscal) como columna diferenciada en el flujo de fondos y mostrar una tarjeta resumen en el panel de Finanzas.

**Architecture:** Nueva funcion `calcularIVAMensual()` en finanzas.ts que calcula credito fiscal (de pedidos recibidos) y debito fiscal (de cuotas vencidas) por mes. El saldo se inyecta en el flujo de fondos como columna `iva` el dia 20 de cada mes (o habil siguiente). Una tarjeta muestra el acumulado y desglose.

**Tech Stack:** Next.js server actions, PostgreSQL (GOcelular), Supabase, React server components

---

### Task 1: Agregar campo `iva` a FlujoDiario y funcion auxiliar diaHabilSiguiente

**Files:**
- Modify: `lib/actions/finanzas.ts`
- Modify: `lib/utils.ts`

- [ ] **Step 1: Agregar `diaHabilSiguiente` a utils.ts**

Agregar al final de `lib/utils.ts`:

```typescript
/** Dado un dia (1-31), mes (0-based) y anio, retorna la fecha del dia habil igual o siguiente.
 *  Si cae sabado pasa al lunes, si cae domingo pasa al lunes. */
export function diaHabilSiguiente(year: number, month: number, day: number): string {
  const date = new Date(year, month, day)
  const dow = date.getDay()
  if (dow === 6) date.setDate(date.getDate() + 2) // sabado -> lunes
  if (dow === 0) date.setDate(date.getDate() + 1) // domingo -> lunes
  return date.toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Agregar campo `iva` a la interface FlujoDiario**

En `lib/actions/finanzas.ts`, agregar `iva: number` a la interface `FlujoDiario` (despues de `out_dev_capital`):

```typescript
interface FlujoDiario {
  cash_date: string
  in_adelantado: number
  in_en_termino: number
  in_atrasado: number
  in_pendiente: number
  in_vencida: number
  in_asistencia: number
  in_proyectado: number
  out_celulares: number
  out_licencias: number
  out_descartables: number
  out_sueldos: number
  out_envios: number
  out_interes: number
  out_otros: number
  out_vta3ero: number
  out_dev_capital: number
  iva: number
  net_flow: number
  cash_balance: number
  estres?: boolean
}
```

- [ ] **Step 3: Agregar `iva: 0` a la funcion `emptyRow`**

En `emptyRow()` (linea ~157), agregar `iva: 0` antes de `net_flow: 0`:

```typescript
    out_dev_capital: 0,
    iva: 0,
    net_flow: 0,
    cash_balance: 0,
```

- [ ] **Step 4: Verificar build**

Run: `npx next build`
Expected: Build succeeds (la columna iva existe pero aun no se usa)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/finanzas.ts lib/utils.ts
git commit -m "feat: add iva field to FlujoDiario and diaHabilSiguiente util"
```

---

### Task 2: Implementar calcularIVAMensual y fetchIVAParaFlujo

**Files:**
- Modify: `lib/actions/finanzas.ts`

- [ ] **Step 1: Agregar imports necesarios**

Al inicio de `lib/actions/finanzas.ts`, agregar:

```typescript
import { getPedidos, getMejorPrecio } from './compras'
import { buscarPrecio, diaHabilSiguiente } from '@/lib/utils'
```

- [ ] **Step 2: Agregar funcion calcularIVAMensual**

Agregar antes de `fetchFlujoDeFondos`:

```typescript
// ---------------------------------------------------------------------------
// IVA: credito y debito fiscal mensual
// ---------------------------------------------------------------------------

interface IVAMensual {
  periodo: string // YYYY-MM
  creditoFiscal: number
  debitoFiscal: number
  saldo: number // credito - debito (positivo = a favor)
}

async function calcularIVAMensual(): Promise<IVAMensual[]> {
  const pedidos = await getPedidos()
  const precios = await getMejorPrecio()

  // Credito fiscal: agrupar por mes de entregadoAt
  const creditoPorMes: Record<string, number> = {}
  for (const p of pedidos) {
    if (!p.entregadoAt) continue
    const mes = p.entregadoAt.slice(0, 7) // YYYY-MM
    if (!creditoPorMes[mes]) creditoPorMes[mes] = 0
    for (const item of p.items) {
      const precioUnit = buscarPrecio(precios, item.productoNombre)
      creditoPorMes[mes] += item.cantidad * precioUnit * 0.21
    }
  }

  // Debito fiscal: cuotas vencidas por mes desde GOcelular
  const pool = getPool()
  const debitoPorMes: Record<string, number> = {}
  if (pool) {
    const client = await pool.connect()
    try {
      const res = await client.query<{ mes: string; debito: string }>(`
        SELECT
          to_char(i.installment_due_at, 'YYYY-MM') AS mes,
          SUM(i.installment_amount - i.installment_amount / 1.21)::text AS debito
        FROM gocuotas_installments i
        JOIN gocuotas_orders go ON go.order_id::text = i.order_id::text
        WHERE go.order_discarded_at IS NULL
          AND i.installment_due_at IS NOT NULL
        GROUP BY mes
        ORDER BY mes
      `)
      for (const r of res.rows) {
        debitoPorMes[r.mes] = Number(r.debito)
      }
    } finally {
      client.release()
    }
  }

  // Combinar periodos
  const allMeses = new Set([...Object.keys(creditoPorMes), ...Object.keys(debitoPorMes)])
  const result: IVAMensual[] = []
  for (const mes of allMeses) {
    const credito = creditoPorMes[mes] ?? 0
    const debito = debitoPorMes[mes] ?? 0
    result.push({ periodo: mes, creditoFiscal: credito, debitoFiscal: debito, saldo: credito - debito })
  }
  return result.sort((a, b) => a.periodo.localeCompare(b.periodo))
}
```

- [ ] **Step 3: Agregar funcion fetchIVAParaFlujo**

Agregar justo despues de `calcularIVAMensual`:

```typescript
/** Retorna un array de { cash_date, iva } para inyectar en el flujo.
 *  El IVA de cada mes se ubica el dia 20 del mes siguiente (o habil siguiente),
 *  que es cuando vence la DDJJ. */
async function fetchIVAParaFlujo(): Promise<{ cash_date: string; iva: number }[]> {
  const meses = await calcularIVAMensual()
  return meses.map(m => {
    const [anio, mes] = m.periodo.split('-').map(Number)
    // DDJJ del mes M se paga el 20 del mes M+1
    const mesSiguiente = mes === 12 ? 1 : mes + 1
    const anioSiguiente = mes === 12 ? anio + 1 : anio
    const fechaPago = diaHabilSiguiente(anioSiguiente, mesSiguiente - 1, 20)
    return { cash_date: fechaPago, iva: m.saldo }
  })
}
```

- [ ] **Step 4: Exportar calcularIVAMensual para la tarjeta**

Agregar `export` a la funcion:

```typescript
export async function calcularIVAMensual(): Promise<IVAMensual[]> {
```

Y exportar la interface tambien:

```typescript
export interface IVAMensual {
```

- [ ] **Step 5: Verificar build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add lib/actions/finanzas.ts
git commit -m "feat: implement calcularIVAMensual and fetchIVAParaFlujo"
```

---

### Task 3: Integrar IVA en fetchFlujoDeFondos

**Files:**
- Modify: `lib/actions/finanzas.ts`

- [ ] **Step 1: Agregar fetchIVAParaFlujo al Promise.all de fetchFlujoDeFondos**

Modificar la linea del Promise.all en `fetchFlujoDeFondos` (linea ~424):

```typescript
export async function fetchFlujoDeFondos(): Promise<FlujoDiario[]> {
  const [income, vta3ero, asistencias, egresos, baseDiario, ivaData] = await Promise.all([
    fetchIncomeFromGocelular(),
    fetchVta3eroFromGocuotas(),
    fetchAsistenciasFromSupabase(),
    fetchEgresosFromSupabase(),
    getProyeccionDiaria(),
    fetchIVAParaFlujo(),
  ])
```

- [ ] **Step 2: Merge IVA data en el flujo**

Agregar despues del bloque de merge de projections (despues de la linea `row.in_proyectado += p.in_proyectado`):

```typescript
  // Merge IVA
  for (const iv of ivaData) {
    const row = getOrCreate(map, iv.cash_date)
    row.iva += iv.iva
  }
```

- [ ] **Step 3: Incluir IVA en el calculo de net_flow**

Modificar el calculo de `net_flow` para incluir `row.iva`:

```typescript
    row.net_flow =
      row.in_adelantado +
      row.in_en_termino +
      row.in_atrasado +
      row.in_pendiente +
      row.in_asistencia +
      row.in_proyectado +
      row.out_celulares +
      row.out_licencias +
      row.out_descartables +
      row.out_sueldos +
      row.out_envios +
      row.out_interes +
      row.out_otros +
      row.out_vta3ero +
      row.out_dev_capital +
      row.iva
```

- [ ] **Step 4: Verificar build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add lib/actions/finanzas.ts
git commit -m "feat: integrate IVA into cash flow calculation"
```

---

### Task 4: Agregar columna IVA a la tabla del flujo de fondos

**Files:**
- Modify: `app/(admin)/finanzas/page.tsx`

- [ ] **Step 1: Agregar header de columna IVA**

En la tabla del flujo (linea ~168), agregar la columna IVA entre `DCp` y `Neto`:

```tsx
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">DCp</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-violet-600">IVA</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-gray-700">Neto</th>
```

- [ ] **Step 2: Agregar celda de datos IVA**

En el tbody, agregar la celda IVA entre `out_dev_capital` y `net_flow`:

```tsx
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_dev_capital)}</td>
                    <td className={`px-0.5 py-0.5 text-right font-semibold ${row.iva > 0 ? 'text-violet-600' : row.iva < 0 ? 'text-violet-700 bg-violet-50' : ''}`}>{fmtCompact(row.iva)}</td>
                    <td className={`px-0.5 py-0.5 text-right font-bold ${row.net_flow >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtCompact(row.net_flow)}</td>
```

- [ ] **Step 3: Verificar build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/finanzas/page.tsx
git commit -m "feat: add IVA column to cash flow table with violet styling"
```

---

### Task 5: Agregar tarjeta IVA al panel de Finanzas

**Files:**
- Modify: `app/(admin)/finanzas/page.tsx`

- [ ] **Step 1: Importar calcularIVAMensual**

Agregar al import de finanzas.ts en page.tsx:

```typescript
import { fetchFlujoDeFondos, fetchAsistencias, fetchEgresos, fetchCuotasStats, fetchEgresosStats, getProyeccionDiaria, fetchPDIndicadores, fetchDPDIndicadores, fetchVintageAnalysis, calcularIVAMensual } from '@/lib/actions/finanzas'
```

- [ ] **Step 2: Agregar la llamada al Promise.all**

En el Promise.all principal (linea ~29), agregar `calcularIVAMensual()`:

```typescript
  const [allFlujoBase, asistencias, egresosRaw, cuotasStats, egresosStats, proyeccionDiaria, pdIndicadores, dpdIndicadores, vintageData, prestamos, todosMovimientos, deudaConfig, interesesMes, productosFinancieros, ivaMensual] = await Promise.all([
    fetchFlujoDeFondos(),
    fetchAsistencias(),
    fetchEgresos(),
    fetchCuotasStats(),
    fetchEgresosStats(),
    getProyeccionDiaria(),
    fetchPDIndicadores(),
    fetchDPDIndicadores(),
    fetchVintageAnalysis(),
    fetchPrestamos(),
    fetchMovimientos(),
    getDeudaConfig(),
    fetchInteresesPagadosMes(),
    fetchProductos(),
    calcularIVAMensual(),
  ])
```

- [ ] **Step 3: Calcular datos para la tarjeta**

Agregar despues del Promise.all, antes de `const { flujo ... } = simularDeuda(...)`:

```typescript
  // IVA card data
  const hoyMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const ivaMesActual = ivaMensual.find(m => m.periodo === hoyMes)
  const ivaAcumulado = ivaMensual
    .filter(m => m.periodo <= hoyMes)
    .reduce((s, m) => s + m.saldo, 0)
  const debitoPromedio = (() => {
    const ultimos3 = ivaMensual
      .filter(m => m.periodo <= hoyMes && m.debitoFiscal > 0)
      .slice(-3)
    if (ultimos3.length === 0) return 0
    return ultimos3.reduce((s, m) => s + m.debitoFiscal, 0) / ultimos3.length
  })()
  const mesesFinanciamiento = debitoPromedio > 0 && ivaAcumulado > 0
    ? Math.round(ivaAcumulado / debitoPromedio * 10) / 10
    : 0
```

- [ ] **Step 4: Agregar la tarjeta al flujoTab**

En el flujoTab, despues de la grid de cuotas vencidas (despues del `</div>` que cierra la grid de 5 cards, linea ~125), agregar:

```tsx
      {/* IVA card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <p className="text-xs text-violet-600 mb-0.5">Saldo IVA acumulado</p>
          <p className={`text-xl font-bold ${ivaAcumulado >= 0 ? 'text-violet-700' : 'text-red-700'}`}>
            {formatearMoneda(Math.abs(ivaAcumulado))}
          </p>
          <p className="text-xs text-violet-500 mt-0.5">{ivaAcumulado >= 0 ? 'A favor' : 'A pagar'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">Mes actual</p>
          <div className="flex items-baseline gap-3">
            <div>
              <p className="text-xs text-green-600">Credito fiscal</p>
              <p className="text-sm font-bold text-green-700">{formatearMoneda(ivaMesActual?.creditoFiscal ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-red-600">Debito fiscal</p>
              <p className="text-sm font-bold text-red-700">{formatearMoneda(ivaMesActual?.debitoFiscal ?? 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">Financiamiento IVA</p>
          <p className="text-xl font-bold text-violet-700">{mesesFinanciamiento} meses</p>
          <p className="text-xs text-gray-400 mt-0.5">Estimado a debito promedio mensual</p>
        </div>
      </div>
```

- [ ] **Step 5: Verificar build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/finanzas/page.tsx
git commit -m "feat: add IVA financing card to finanzas panel"
```

---

### Task 6: Build final y deploy

- [ ] **Step 1: Build completo**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Deploy**

Run: `npx vercel --prod --yes`
Expected: Deployment successful

- [ ] **Step 3: Verificar en produccion**

1. Ir a /finanzas
2. Verificar que aparece la tarjeta IVA con saldo, desglose y meses de financiamiento
3. Verificar que la columna IVA aparece en la tabla del flujo en color violeta
4. Verificar que el IVA se suma/resta al neto y al saldo acumulado
5. Verificar que el IVA aparece solo el dia 20 (o habil siguiente) de cada mes
