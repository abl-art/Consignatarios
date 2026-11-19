# Informe Diario por Mail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cron diario a las 6:00 ART que arma y envía a Emiliano un mail HTML con ventas de ayer + stock/forecast, avance vs proyección, seguros, caja 7 días, PD/incobrabilidad, depósito y agenda.

**Architecture:** Lógica pura y template HTML en `lib/informe-diario.ts` (testeada); recolección de datos en `lib/actions/informe-diario.ts` reutilizando los fetchers existentes, cada bloque con su propio try/catch (un bloque caído → nota, el mail sale igual); ruta cron `/api/cron/informe-diario` con el patrón Bearer CRON_SECRET del repo; Google Calendar se extrae a `lib/calendar-google.ts` compartido entre la ruta API existente y el informe.

**Tech Stack:** Next.js 14 route handler, pg (pools existentes), nodemailer vía `enviarMail` (lib/mailer.ts), vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-informe-diario-design.md`

## Global Constraints

- El mail NUNCA deja de salir por un bloque caído: cada bloque de datos se recolecta con try/catch independiente; `null` ⇒ el HTML muestra la nota de fallback del bloque (la de caja menciona la ventana de backup).
- La base directa de GOcuotas solo se toca vía `fetchFlujoDeFondosPorCanal()` (ya existente), SIEMPRE con catch — a las 6 AM suele estar en ventana de backup.
- Fechas "ayer"/"hoy" en hora ART: `new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })`; "ayer" = hoy ART − 1 día calculado con Date.UTC. Funciones puras reciben fechas como strings `YYYY-MM-DD`.
- Ventas de ayer por `order_created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'` (NO `created_at`, que es el insert de la réplica), órdenes `order_discarded_at IS NULL`; propia = `CLIENT_IDS_PROPIOS`, terceros = resto (`sqlCondicionClientes`).
- Look & feel del mail (decisión 11 del spec): estilos inline, tarjetas borde `#e5e7eb`, headers de tabla `#f9fafb`/texto `#4b5563`, tablas 12px, acentos `#111827`, header magenta `#db2777`, semánticos verde `#16a34a` / ámbar `#d97706` / rojo `#dc2626`, fuente `system-ui, Arial`.
- Umbrales reutilizados: `DIAS_RIESGO=14` / `DIAS_CRITICO=10` de `@/lib/inventario-indicadores` para pintar días de stock; veredicto forecast: ≥97% "se encamina a cumplir", 90–97% "va justo", <90% "no llega".
- Cambios a `fetchPDIndicadores` son ADITIVOS (campos nuevos `den_hard`/`den_30` en las filas); ningún consumidor existente cambia de comportamiento.
- Destinatario `emiliano.canova@gocuotas.com`, override env `INFORME_MAIL_PARA`. Asunto: `GOcelular360 — Informe diario <YYYY-MM-DD>` (fecha ART de ayer-reportado... usar la fecha del DÍA del envío).
- No deployar: el deploy lo decide Emiliano al final.

## Review Focus

1. Día sin ventas (domingo/feriado) → bloque ventas muestra "0 órdenes" prolijo, tabla de modelos vacía sin romper. → Task 1, test de `armarInformeDiario` con ventas vacías.
2. Caja caída por backup (reject de `fetchFlujoDeFondosPorCanal`) → nota de backup, resto del mail intacto. → Task 1 test bloque null; Task 4 catch.
3. Modelo vendido ayer sin match en inventario/forecast (accesorio, variante nueva) → "—" en días de stock y a comprar, nunca NaN/undefined. → Task 1, test de armado de filas de modelos.
4. Ningún mes de originación califica para la tabla PD completa (histórico corto) → tabla con los meses que tengan al menos C2 y nota "C4 aún sin datos" en vez de celdas 0% engañosas. → Task 1, test de `seleccionarMesesPD`.
5. Calendar no conectado / token vencido sin refresh (`not_connected`) → agenda muestra solo ToDos con nota "calendario no conectado". → Task 1 test de fallback; Task 3 retorno tipado.

---

### Task 1: Lógica pura y template `lib/informe-diario.ts`

**Files:**
- Create: `lib/informe-diario.ts`
- Test: `__tests__/informe-diario.test.ts`

**Interfaces:**
- Consumes: `DIAS_RIESGO`, `DIAS_CRITICO` de `@/lib/inventario-indicadores`; type `VintageRow` de `@/lib/actions/finanzas`; type `FlujoDiario` de `@/lib/flujo-canal`.
- Produces (todo exportado):

```ts
export interface VentasCanalDia { ordenes: number; monto: number }
export interface ModeloVendidoAyer {
  modelo: string            // normalizado para display
  unidades: number
  diasStock: number | null  // cobertura proyectada; null = sin match
  aComprarMin: number | null // por método, null = sin match en forecast
  aComprarMax: number | null
}
export interface ForecastMes {
  mes: string
  realParcial: { ventas: number; monto: number } | null
  hibrido: { ventas: number } | null
  gocuotas: { ventas: number } | null
  fraccionTranscurrida: number // (0,1]
}
export interface VeredictoForecast {
  runRate: number            // estimación de cierre en unidades
  contraHibrido: number | null // runRate / proyección (ratio), null sin proyección
  contraGocuotas: number | null
  frase: string              // "se encamina a cumplir…" | "va justo…" | "no llega…"
}
export interface PDCelda { mes: string; cuota: number; pdHard: number; pd30: number; denHard: number; den30: number }
export interface SegurosDia { emitidas: number; siniestros: number }
export interface CajaDia { fecha: string; saldo: number }
export interface DepositoResumen {
  expedidosAyer: number
  enCola: number; enviadosSinExpedir: number; enPicking: number; requierenAtencion: number
  demorados: { cantidad: number; peores: { ref: string; dias: number }[] }
  arrepentimientosAbiertos: number; arrepentimientosAyer: number
  pendientesRegreso: number
}
export interface AgendaHoy {
  todos: { texto: string; fecha: string; urgente: boolean }[]
  eventos: { titulo: string; horaInicio: string; horaFin: string }[] | null // null = calendario no conectado
}
export interface DatosInforme {
  fecha: string      // día del informe (hoy ART)
  ayer: string
  ventas: { propia: VentasCanalDia; terceros: VentasCanalDia; modelos: ModeloVendidoAyer[] } | null
  forecast: { mes: ForecastMes; veredicto: VeredictoForecast } | null
  seguros: SegurosDia | null
  caja: CajaDia[] | null          // hoy..hoy+7
  pd: { celdas: PDCelda[]; meses: string[]; nota: string | null } | null
  incobrabilidad: { mes: string; pct: number; monto: number }[] | null
  deposito: DepositoResumen | null
  agenda: AgendaHoy | null
}

export function seleccionarMesesPD(filas: PDCelda[], cuotas?: number[], n?: number): { meses: string[]; nota: string | null }
export function cohortesMaduras(rows: VintageRow[]): VintageRow[]
export function veredictoForecast(mes: ForecastMes): VeredictoForecast
export function serieCaja(flujo: FlujoDiario[], hoy: string, dias?: number): CajaDia[]
export function armarInformeDiario(datos: DatosInforme): { html: string; texto: string }
```

Contratos que los tests fijan:
- `seleccionarMesesPD(filas, [2,3,4], 3)`: los 3 meses de originación más recientes donde TODAS las cuotas pedidas tienen `denHard > 0` Y `den30 > 0`. Si ningún mes califica completo, cae a los meses donde al menos C2 tiene datos y `nota` explica qué cuotas faltan; con datos completos `nota = null`.
- `cohortesMaduras(rows)`: meses con `amt_por_vencer === 0 && amt_mora_1_29 === 0 && amt_mora_30_59 === 0 && amt_mora_60_89 === 0` (equivale a "última cuota vencida hace 90+ días": toda cuota impaga más joven estaría en un bucket de mora <90). Devuelve los últimos 6, ascendente.
- `veredictoForecast`: `runRate = realParcial.ventas / fraccionTranscurrida` (redondeado); ratios contra cada método; `frase` según el PEOR ratio disponible con umbrales 0.97/0.90; sin proyección ⇒ frase "sin proyección congelada para este mes".
- `serieCaja(flujo, hoy, 7)`: filas con `cash_date >= hoy` hasta hoy+7 inclusive, mapeadas a `{fecha, saldo: cash_balance}`.
- `armarInformeDiario`: HTML con los 7 bloques en el orden del spec; CUALQUIER bloque null ⇒ su tarjeta con la nota de fallback (caja: "no disponible — ventana de backup de GOcuotas, ver /finanzas más tarde"); días de stock pintados rojo `≤ DIAS_CRITICO` / ámbar `< DIAS_RIESGO` / verde; saldos de caja negativos en rojo y el mínimo de la semana en negrita; a comprar "X–Y u." o "X u." si min===max, "—" si null; `texto` = versión plana corta (asunto + totales clave) para el fallback de clientes sin HTML.

- [ ] **Step 1: Escribir tests que fallan** — casos: los 5 del Review Focus + `seleccionarMesesPD` con mes joven (C4 sin denominador) excluido + `cohortesMaduras` excluye mes con mora_30_59 > 0 + `veredictoForecast` en los 3 tramos (0.98 / 0.93 / 0.80) + `serieCaja` corta en hoy+7 + HTML contiene los colores `#dc2626`/`#d97706` según umbrales.
- [ ] **Step 2: Verificar que fallan** — `npx vitest run __tests__/informe-diario.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `lib/informe-diario.ts`** con las firmas de arriba. El HTML se arma con helpers internos (`tarjeta(titulo, contenidoHtml)`, `tabla(headers, filas)`) — estilos inline de las Global Constraints.
- [ ] **Step 4: Verificar que pasan** — `npx vitest run __tests__/informe-diario.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add lib/informe-diario.ts __tests__/informe-diario.test.ts && git commit -m "feat(informe): lógica pura y template del informe diario"`

### Task 2: Denominadores en `fetchPDIndicadores`

**Files:**
- Modify: `lib/actions/finanzas.ts` (~líneas 956-1106: interface PDRow, parseRows y el SELECT ya computa `den_hard`/`den_30` — solo exponerlos)

**Interfaces:**
- Produces: `PDRow` (byOrigination/byDueMonth) gana campos `den_hard: number` y `den_30: number` (montos). `resumen` no cambia. La interface `PDRow` local se exporta como `PDRowIndicadores` para que Task 4 la importe.

- [ ] **Step 1: Aplicar el cambio** — las queries ya devuelven `den_hard`/`den_30`; `parseRows` los agrega al objeto con `Number(...)`.
- [ ] **Step 2: Verificar** — `npm test` PASS; `npx tsc --noEmit` sin errores nuevos (hay 1 pre-existente en gocelular-prices.test.ts).
- [ ] **Step 3: Commit** — `git commit -am "refactor(finanzas): exponer denominadores en PD (informe diario)"`

### Task 3: Extraer Google Calendar a `lib/calendar-google.ts`

**Files:**
- Create: `lib/calendar-google.ts`
- Modify: `app/api/calendar/route.ts` (el GET pasa a usar la lib; POST/PATCH intactos salvo `getAccessToken` importado)

**Interfaces:**
- Produces:

```ts
export async function getAccessToken(): Promise<string | null>  // movido tal cual de la ruta
export interface EventoCalendario { id: string; titulo: string; horaInicio: string; horaFin: string; asistentes: string[] }
export async function eventosDelDia(fecha: string): Promise<EventoCalendario[] | null> // null = not_connected; throw en error de API
```

- [ ] **Step 1: Crear la lib** moviendo `getAccessToken` y la lógica GET de eventos (misma query a Google, mismo shape).
- [ ] **Step 2: Refactorizar la ruta** para delegar en la lib (respuestas HTTP idénticas: `{ events }`, 401 `not_connected`, error con detail).
- [ ] **Step 3: Verificar** — `npx tsc --noEmit` limpio; `npm run build` OK (la ruta compila).
- [ ] **Step 4: Commit** — `git commit -am "refactor(calendar): lógica de Google Calendar compartida en lib"`

### Task 4: Recolección de datos `lib/actions/informe-diario.ts`

**Files:**
- Create: `lib/actions/informe-diario.ts`

**Interfaces:**
- Consumes: todo Task 1 (types) + `PDRowIndicadores` (Task 2) + `eventosDelDia` (Task 3) + existentes: `fetchInventarioResumen` (`lib/actions/inventario-resumen.ts`), `coberturaProyectada`/`modelosAComprar`/`normalizarModelo` (`lib/inventario-indicadores.ts`), `forecastCompras`/`prorratearMesActual` (`lib/forecast-compras.ts`), `getProyeccionPropiaRun`/`getProyeccionInicial` (`lib/actions/proyecciones.ts`), `fraccionMesTranscurrida` (`lib/proyeccion-ventas.ts`), `getCertificados`/`getSiniestros` (`lib/actions/seguros.ts`), `fetchFlujoDeFondosPorCanal`/`fetchPDIndicadores`/`fetchVintageAnalysis` (`lib/actions/finanzas.ts`), `getWarehouseReport` (`lib/actions/warehouse-andreani.ts`), `fetchAlertasEnvios`/`fetchDemorasEntrega` (`lib/gocelular.ts`), `getArrepentimientos` (`lib/actions/arrepentimientos.ts`), `getPendientesRegreso` (`lib/actions/envios-regreso.ts`), `fetchTodos` (`app/(admin)/notas/actions.ts`), `sqlCondicionClientes`/`CLIENT_IDS_PROPIOS`/`CLIENTES_TODOS` (`lib/client-ids.ts`), `getPool` (`lib/db-pool.ts`).
- Produces: `export async function recolectarDatosInforme(fecha?: string): Promise<DatosInforme>` — `fecha` opcional desplaza SOLO los bloques "de ayer" (decisión 10 del spec).

- [ ] **Step 1: Fetcher nuevo de ventas de ayer** (interno): una query a la réplica por canal — `COUNT(DISTINCT o.order_id)`, `SUM(i amount)? NO: monto = SUM(total_order_amount normalizado /100 si >5M)` agrupado propia/terceros con la condición ART de Global Constraints; y modelos: propia por `store_orders.product_name` (JOIN por `gocuotas_order_id`, mismo criterio de día), terceros por `devices.model` (patrón MIN por orden de `lib/bloqueo.ts`); unificar con `normalizarModelo`, sumar unidades.
- [ ] **Step 2: Armar cada bloque con try/catch** (helper `bloque<T>(fn): Promise<T | null>` que loguea el error):
  - ventas: step 1 + cruce con `fetchInventarioResumen` (celulares.modelos + reposiciones → `coberturaProyectada`/`modelosAComprar` → `diasStock`/pipeline) y `getProyeccionPropiaRun` + `forecastCompras` corrido DOS veces (una por método, su `porMetodo` como `proyeccion`) → `aComprarMin/Max` por modelo (match por `normalizarModelo`).
  - forecast: `getProyeccionInicial()` → fila del `mesActual` en `total` → `ForecastMes` con `fraccionMesTranscurrida(hoy)` → `veredictoForecast`.
  - seguros: `getCertificados()`/`getSiniestros()` filtrados por `createdAt` en el día ART de ayer (emitidas además `estado === 'emitido'`).
  - caja: `fetchFlujoDeFondosPorCanal()` → `serieCaja(r.total, hoy, 7)`.
  - pd: `fetchPDIndicadores()` → mapear `byOrigination` a `PDCelda[]` (cuotas 2/3/4) → `seleccionarMesesPD`.
  - incobrabilidad: `fetchVintageAnalysis()` → `cohortesMaduras` → `{mes, pct: pct_incobrable_90_plus, monto: amt_incobrable_90_plus}`.
  - deposito: `getWarehouseReport(ayerISO, ayerISO)` (counts vivos + `expedidosPorDia` de ayer) + `fetchAlertasEnvios`/`fetchDemorasEntrega` (cantidad + top 5 por días desc) + `getArrepentimientos` (abiertos = `estado === 'pendiente'`; ayer = `emailFecha` en el día) + `getPendientesRegreso` (filtrar `regresoAuto === false`).
  - agenda: `fetchTodos()` (shape `Record<fechaISO, {id,text,done,prioridad?}[]>` → pendientes `done===false` con fecha ≤ hoy, urgentes primero) + `eventosDelDia(hoy)` (null ⇒ `eventos: null`).
  Secuencia: bloques de réplica en serie de a 2 (pool max 5 compartido con la app); caja al final, sola.
- [ ] **Step 3: Verificar** — `npx tsc --noEmit` sin errores nuevos; `npm test` PASS.
- [ ] **Step 4: Commit** — `git add lib/actions/informe-diario.ts && git commit -m "feat(informe): recolección de datos con bloques tolerantes a falla"`

### Task 5: Ruta cron + schedule

**Files:**
- Create: `app/api/cron/informe-diario/route.ts`
- Modify: `vercel.json` (agregar `{ "path": "/api/cron/informe-diario", "schedule": "0 9 * * *" }`)

**Interfaces:**
- Consumes: `recolectarDatosInforme` (Task 4), `armarInformeDiario` (Task 1), `enviarMail` (`lib/mailer.ts`), `getSupabasePool` para `flujo_config`.

- [ ] **Step 1: Implementar la ruta** — patrón del repo: `dynamic = 'force-dynamic'`, `maxDuration = 300`, GET con Bearer `CRON_SECRET` (401 si no). Query params: `dry=1` → devuelve `{ html }` sin enviar ni registrar; `fecha=YYYY-MM-DD` → pasa a `recolectarDatosInforme`; `force=1` → saltea idempotencia. Idempotencia: leer/escribir `flujo_config` key `informe_diario_ultimo` (valor = fecha ART); si ya es hoy y no hay force → `{ ok: true, skipped: true }`. Envío: `enviarMail({ para: process.env.INFORME_MAIL_PARA ?? 'emiliano.canova@gocuotas.com', asunto, texto, html })`; si `ok:false` → status 500 con el error (para que el cron reintente/alerte).
- [ ] **Step 2: Verificar build** — `npm run build` OK.
- [ ] **Step 3: Commit** — `git add app/api/cron/informe-diario/route.ts vercel.json && git commit -m "feat(informe): cron diario 6AM ART con dry-run e idempotencia"`

### Task 6: Verificación end-to-end

- [ ] **Step 1:** `npm test` → PASS completo; `npm run build` → OK.
- [ ] **Step 2: Dry-run real** — `npm run dev` en background; `curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/informe-diario?dry=1"` (CRON_SECRET de .env.local, ojo \n literales) → guardar el `html` a un archivo del scratchpad y revisarlo: los 7 bloques presentes (o sus fallbacks), números plausibles (comparar ventas de ayer contra una query directa a la réplica), colores correctos. Si la corrida es en ventana de backup, verificar que caja muestra el fallback y el resto vive.
- [ ] **Step 3: Envío real de prueba** — mismo curl sin `dry` con `force=1` → mail real a Emiliano; verificar `{ ok: true }` y que `informe_diario_ultimo` quedó con la fecha. Avisarle a Emiliano que revise cómo se ve en su casilla ANTES de deployar.
- [ ] **Step 4:** No deployar. Reportar.
