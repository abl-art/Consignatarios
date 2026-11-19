// ─── Informe diario por mail ───────────────────────────────────────────────
// Lógica pura y template HTML del mail de las 6 AM. La recolección de datos
// vive en lib/actions/informe-diario.ts; acá no hay I/O.

import { DIAS_RIESGO, DIAS_CRITICO } from '@/lib/inventario-indicadores'
import type { VintageRow } from '@/lib/actions/finanzas'
import type { FlujoDiario } from '@/lib/flujo-canal'

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface VentasCanalDia { ordenes: number; monto: number }
export interface ModeloVendidoAyer {
  modelo: string
  unidades: number
  diasStock: number | null
  aComprarMin: number | null
  aComprarMax: number | null
}
export interface ForecastMes {
  mes: string
  realParcial: { ventas: number; monto: number } | null
  hibrido: { ventas: number } | null
  gocuotas: { ventas: number } | null
  fraccionTranscurrida: number
}
export interface VeredictoForecast {
  runRate: number
  contraHibrido: number | null
  contraGocuotas: number | null
  frase: string
}
export interface PDCelda { mes: string; cuota: number; pdHard: number; pd30: number; denHard: number; den30: number }
export interface SegurosDia { emitidas: number; siniestros: number }
export interface CajaDia { fecha: string; saldo: number }
export interface DepositoResumen {
  expedidosAyer: number
  enCola: number
  enviadosSinExpedir: number
  enPicking: number
  requierenAtencion: number
  demorados: { cantidad: number; peores: { ref: string; dias: number }[] }
  arrepentimientosAbiertos: number
  arrepentimientosAyer: number
  pendientesRegreso: number
}
export interface AgendaHoy {
  todos: { texto: string; fecha: string; urgente: boolean }[]
  eventos: { titulo: string; horaInicio: string; horaFin: string }[] | null
}
export interface DatosInforme {
  fecha: string
  ayer: string
  ventas: { propia: VentasCanalDia; terceros: VentasCanalDia; modelos: ModeloVendidoAyer[] } | null
  forecast: { mes: ForecastMes; veredicto: VeredictoForecast } | null
  seguros: SegurosDia | null
  caja: CajaDia[] | null
  pd: { celdas: PDCelda[]; meses: string[]; nota: string | null } | null
  incobrabilidad: { mes: string; pct: number; monto: number }[] | null
  deposito: DepositoResumen | null
  agenda: AgendaHoy | null
}

// ─── Colores y estilos (look & feel de la app, inline para mail) ──────────

const C = {
  borde: '#e5e7eb',
  headerBg: '#f9fafb',
  headerTexto: '#4b5563',
  texto: '#111827',
  gris: '#6b7280',
  verde: '#16a34a',
  ambar: '#d97706',
  rojo: '#dc2626',
  magenta: '#db2777',
}

const FUENTE = "system-ui, Arial, sans-serif"

// ─── Funciones puras ──────────────────────────────────────────────────────

/**
 * Elige los n meses de originación más recientes donde TODAS las cuotas
 * pedidas tienen denominador > 0 (hard y 30). Si ningún mes califica
 * completo, cae a los meses con datos de la primera cuota y lo explica.
 */
export function seleccionarMesesPD(
  filas: PDCelda[],
  cuotas: number[] = [2, 3, 4],
  n: number = 3,
): { meses: string[]; nota: string | null } {
  const porMes = new Map<string, Map<number, PDCelda>>()
  for (const f of filas) {
    if (!porMes.has(f.mes)) porMes.set(f.mes, new Map())
    porMes.get(f.mes)!.set(f.cuota, f)
  }
  const meses = [...porMes.keys()].sort()

  const completos = meses.filter(m =>
    cuotas.every(c => {
      const f = porMes.get(m)!.get(c)
      return f !== undefined && f.denHard > 0 && f.den30 > 0
    })
  )
  if (completos.length > 0) {
    return { meses: completos.slice(-n), nota: null }
  }

  // Fallback: meses con datos de la primera cuota; nota con lo que falta
  const cuotaBase = cuotas[0]
  const conBase = meses.filter(m => {
    const f = porMes.get(m)!.get(cuotaBase)
    return f !== undefined && f.denHard > 0
  })
  const faltantes = cuotas.filter(c =>
    !meses.some(m => {
      const f = porMes.get(m)!.get(c)
      return f !== undefined && f.denHard > 0 && f.den30 > 0
    })
  )
  const nota = `Sin meses con la tabla completa: ${faltantes.map(c => `C${c}`).join(', ')} aún sin datos suficientes.`
  return { meses: conBase.slice(-n), nota }
}

/**
 * Cohortes maduras del vintage: la última cuota venció hace 90+ días.
 * Equivale a: nada por vencer y nada en buckets de mora <90 (toda cuota
 * impaga más joven estaría en mora 1-29/30-59/60-89). Últimos 6, ascendente.
 */
export function cohortesMaduras(rows: VintageRow[]): VintageRow[] {
  return rows
    .filter(r =>
      r.amt_por_vencer === 0 &&
      r.amt_mora_1_29 === 0 &&
      r.amt_mora_30_59 === 0 &&
      r.amt_mora_60_89 === 0
    )
    .sort((a, b) => a.origination_month.localeCompare(b.origination_month))
    .slice(-6)
}

/** Estimación simple de cierre del mes por run-rate contra ambos métodos. */
export function veredictoForecast(mes: ForecastMes): VeredictoForecast {
  const real = mes.realParcial?.ventas ?? 0
  const fraccion = mes.fraccionTranscurrida > 0 ? mes.fraccionTranscurrida : 1
  const runRate = Math.round(real / fraccion)
  const contraHibrido = mes.hibrido && mes.hibrido.ventas > 0 ? runRate / mes.hibrido.ventas : null
  const contraGocuotas = mes.gocuotas && mes.gocuotas.ventas > 0 ? runRate / mes.gocuotas.ventas : null

  const ratios = [contraHibrido, contraGocuotas].filter((r): r is number => r !== null)
  let frase: string
  if (ratios.length === 0) {
    frase = 'sin proyección congelada para este mes'
  } else {
    const peor = Math.min(...ratios)
    if (peor >= 0.97) frase = `se encamina a cumplir (est. ${runRate.toLocaleString('es-AR')} u.)`
    else if (peor >= 0.9) frase = `va justo (est. ${runRate.toLocaleString('es-AR')} u., ${Math.round(peor * 100)}% del objetivo)`
    else frase = `no llega (est. ${runRate.toLocaleString('es-AR')} u., ${Math.round(peor * 100)}% del objetivo)`
  }
  return { runRate, contraHibrido, contraGocuotas, frase }
}

/** Serie de caja desde hoy hasta hoy+dias inclusive. */
export function serieCaja(flujo: FlujoDiario[], hoy: string, dias: number = 7): CajaDia[] {
  const [y, m, d] = hoy.split('-').map(Number)
  const hasta = new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
  return flujo
    .filter(f => {
      const fecha = f.cash_date.slice(0, 10)
      return fecha >= hoy && fecha <= hasta
    })
    .map(f => ({ fecha: f.cash_date.slice(0, 10), saldo: f.cash_balance }))
}

// ─── Helpers de formato ───────────────────────────────────────────────────

function moneda(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function colorDiasStock(dias: number | null): string {
  if (dias === null) return C.gris
  if (dias <= DIAS_CRITICO) return C.rojo
  if (dias < DIAS_RIESGO) return C.ambar
  return C.verde
}

function rangoAComprar(min: number | null, max: number | null): string {
  if (min === null || max === null) return '—'
  if (min === max) return `${min} u.`
  return `${min}–${max} u.`
}

// ─── Template HTML ────────────────────────────────────────────────────────

function tarjeta(titulo: string, contenido: string): string {
  return `
  <div style="background:#ffffff;border:1px solid ${C.borde};border-radius:12px;padding:16px;margin-bottom:16px;">
    <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:${C.texto};">${titulo}</p>
    ${contenido}
  </div>`
}

function fallback(texto: string): string {
  return `<p style="margin:0;font-size:12px;color:${C.gris};font-style:italic;">${texto}</p>`
}

function tabla(headers: string[], filas: string[][], align: ('left' | 'right' | 'center')[] = []): string {
  const th = headers
    .map((h, i) => `<th style="text-align:${align[i] ?? 'left'};padding:6px 8px;font-size:11px;color:${C.headerTexto};background:${C.headerBg};border-bottom:1px solid ${C.borde};">${h}</th>`)
    .join('')
  const trs = filas
    .map(f => `<tr>${f.map((c, i) => `<td style="text-align:${align[i] ?? 'left'};padding:5px 8px;font-size:12px;color:${C.texto};border-bottom:1px solid #f3f4f6;">${c}</td>`).join('')}</tr>`)
    .join('')
  return `<table style="width:100%;border-collapse:collapse;font-family:${FUENTE};">\n<tr>${th}</tr>\n${trs}\n</table>`
}

function bloqueVentas(d: DatosInforme): string {
  if (!d.ventas) return tarjeta(`Ventas de ayer (${fechaCorta(d.ayer)})`, fallback('No disponible — ver Dashboard360.'))
  const v = d.ventas
  const resumen = `
  <p style="margin:0 0 8px;font-size:13px;color:${C.texto};">
    Propia: <strong>${v.propia.ordenes} órdenes</strong> · ${moneda(v.propia.monto)}
    &nbsp;&nbsp;|&nbsp;&nbsp;
    Terceros: <strong>${v.terceros.ordenes} órdenes</strong> · ${moneda(v.terceros.monto)}
  </p>`
  const filas = v.modelos.map(m => [
    m.modelo,
    String(m.unidades),
    m.diasStock === null
      ? `<span style="color:${C.gris};">—</span>`
      : `<span style="color:${colorDiasStock(m.diasStock)};font-weight:600;">${m.diasStock} d</span>`,
    rangoAComprar(m.aComprarMin, m.aComprarMax),
  ])
  const cuerpo = v.modelos.length === 0
    ? fallback('Sin modelos vendidos ayer.')
    : tabla(['Modelo', 'Vendidos', 'Días de stock', 'A comprar (forecast)'], filas, ['left', 'right', 'right', 'right'])
  return tarjeta(`Ventas de ayer (${fechaCorta(d.ayer)})`, resumen + cuerpo)
}

function bloqueForecast(d: DatosInforme): string {
  if (!d.forecast) return tarjeta('Forecast de ventas', fallback('No disponible — ver /canales/proyeccion.'))
  const { mes, veredicto } = d.forecast
  const real = mes.realParcial?.ventas ?? 0
  const pctMes = Math.round(mes.fraccionTranscurrida * 100)
  const filas: string[][] = []
  for (const [nombre, proy] of [['Híbrido', mes.hibrido], ['GOcuotas', mes.gocuotas]] as const) {
    if (!proy) continue
    const esperado = proy.ventas * mes.fraccionTranscurrida
    const dif = esperado > 0 ? (real / esperado - 1) * 100 : 0
    const color = dif >= 0 ? C.verde : C.rojo
    filas.push([
      nombre,
      proy.ventas.toLocaleString('es-AR'),
      Math.round(esperado).toLocaleString('es-AR'),
      real.toLocaleString('es-AR'),
      `<span style="color:${color};font-weight:600;">${dif >= 0 ? '+' : ''}${dif.toFixed(1)}%</span>`,
    ])
  }
  const cuerpo = filas.length === 0
    ? fallback('Sin proyección congelada para este mes.')
    : tabla(['Método', 'Proy. mes', `Esperado al día (${pctMes}%)`, 'Real', 'Dif'], filas, ['left', 'right', 'right', 'right', 'right'])
  const estim = `<p style="margin:8px 0 0;font-size:12px;color:${C.texto};">Estimación de cierre: <strong>${veredicto.frase}</strong></p>`
  return tarjeta(`Forecast de ventas — ${mes.mes}`, cuerpo + estim)
}

function bloqueSeguros(d: DatosInforme): string {
  if (!d.seguros) return tarjeta('Seguros', fallback('No disponible — ver /seguros.'))
  return tarjeta('Seguros', `
  <p style="margin:0;font-size:13px;color:${C.texto};">
    Pólizas emitidas ayer: <strong>${d.seguros.emitidas}</strong>
    &nbsp;&nbsp;|&nbsp;&nbsp;
    Siniestros denunciados ayer: <strong style="color:${d.seguros.siniestros > 0 ? C.ambar : C.texto};">${d.seguros.siniestros}</strong>
  </p>`)
}

function bloqueCaja(d: DatosInforme): string {
  if (!d.caja || d.caja.length === 0) {
    return tarjeta('Caja — próximos 7 días', fallback('No disponible — ventana de backup de GOcuotas, ver /finanzas más tarde.'))
  }
  const minSaldo = Math.min(...d.caja.map(c => c.saldo))
  const filas = d.caja.map(c => {
    const esMin = c.saldo === minSaldo
    const color = c.saldo < 0 ? C.rojo : C.texto
    const valor = `<span style="color:${color};">${moneda(c.saldo)}</span>`
    return [fechaCorta(c.fecha), esMin ? `<strong>${valor} ◀ mínimo</strong>` : valor]
  })
  return tarjeta('Caja — próximos 7 días', tabla(['Día', 'Saldo proyectado'], filas, ['left', 'right']))
}

function bloquePD(d: DatosInforme): string {
  if (!d.pd) return tarjeta('Payment Defaults — cuotas 2, 3 y 4', fallback('No disponible — ver Finanzas → Payment Defaults.'))
  const { celdas, meses, nota } = d.pd
  const porKey = new Map(celdas.map(c => [`${c.mes}|${c.cuota}`, c]))
  const filas: string[][] = []
  for (const cuota of [2, 3, 4]) {
    const fila = [`<strong>C${cuota}</strong>`]
    for (const mes of meses) {
      const c = porKey.get(`${mes}|${cuota}`)
      fila.push(c ? `${c.pdHard.toFixed(1)}% / ${c.pd30.toFixed(1)}%` : '—')
    }
    filas.push(fila)
  }
  const cuerpo = tabla(['Cuota', ...meses.map(fmtMes)], filas, ['left', ...meses.map(() => 'right' as const)])
  const leyenda = `<p style="margin:6px 0 0;font-size:11px;color:${C.gris};">PD Hard / PD30, por mes de venta. Canal total.</p>`
  const notaHtml = nota ? `<p style="margin:6px 0 0;font-size:11px;color:${C.ambar};">${nota}</p>` : ''
  return tarjeta('Payment Defaults — cuotas 2, 3 y 4', cuerpo + leyenda + notaHtml)
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function fmtMes(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES_CORTOS[Number(m) - 1] ?? m}-${y.slice(-2)}`
}

function bloqueIncobrabilidad(d: DatosInforme): string {
  if (!d.incobrabilidad) return tarjeta('Incobrabilidad — cohortes cerradas', fallback('No disponible — ver Finanzas → Vintage.'))
  if (d.incobrabilidad.length === 0) return tarjeta('Incobrabilidad — cohortes cerradas', fallback('Todavía no hay cohortes maduras (90+ días desde la última cuota).'))
  const filas = d.incobrabilidad.map(i => [
    fmtMes(i.mes),
    `<span style="color:${i.pct >= 8 ? C.rojo : i.pct >= 5 ? C.ambar : C.verde};font-weight:600;">${i.pct.toFixed(2)}%</span>`,
    moneda(i.monto),
  ])
  return tarjeta(
    'Incobrabilidad — cohortes cerradas (90+ días de la última cuota)',
    tabla(['Mes de venta', 'Incobrable 90+', 'Monto'], filas, ['left', 'right', 'right'])
  )
}

function bloqueDeposito(d: DatosInforme): string {
  if (!d.deposito) return tarjeta('Depósito', fallback('No disponible — ver /compras/envios.'))
  const dep = d.deposito
  const resumen = `
  <p style="margin:0 0 8px;font-size:13px;color:${C.texto};">
    Expedidos ayer: <strong>${dep.expedidosAyer}</strong>
    &nbsp;|&nbsp; En cola: <strong>${dep.enCola}</strong>
    &nbsp;|&nbsp; Enviados sin expedir: <strong>${dep.enviadosSinExpedir}</strong>
    &nbsp;|&nbsp; En picking: <strong>${dep.enPicking}</strong>
    &nbsp;|&nbsp; <span style="color:${dep.requierenAtencion > 0 ? C.rojo : C.texto};">Requieren atención: <strong>${dep.requierenAtencion}</strong></span>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:${C.texto};">
    Arrepentimientos abiertos: <strong>${dep.arrepentimientosAbiertos}</strong> (${dep.arrepentimientosAyer} entraron ayer)
    &nbsp;|&nbsp; Pendientes de regreso: <strong>${dep.pendientesRegreso}</strong>
  </p>`
  let demorados = `<p style="margin:0;font-size:12px;color:${dep.demorados.cantidad > 0 ? C.ambar : C.verde};">Demorados: <strong>${dep.demorados.cantidad}</strong></p>`
  if (dep.demorados.peores.length > 0) {
    demorados += tabla(
      ['Pedido/Envío', 'Días'],
      dep.demorados.peores.map(p => [p.ref, `<span style="color:${C.rojo};font-weight:600;">${p.dias}</span>`]),
      ['left', 'right']
    )
  }
  return tarjeta('Depósito', resumen + demorados)
}

function bloqueAgenda(d: DatosInforme): string {
  if (!d.agenda) return tarjeta('Agenda de hoy', fallback('No disponible.'))
  const a = d.agenda
  let cuerpo = ''
  if (a.todos.length === 0) {
    cuerpo += fallback('Sin ToDos pendientes.')
  } else {
    cuerpo += tabla(
      ['ToDo', 'Fecha'],
      a.todos.map(t => [
        t.urgente ? `<strong style="color:${C.rojo};">${t.texto}</strong>` : t.texto,
        fechaCorta(t.fecha),
      ]),
      ['left', 'right']
    )
  }
  if (a.eventos === null) {
    cuerpo += `<p style="margin:8px 0 0;font-size:11px;color:${C.gris};font-style:italic;">calendario no conectado</p>`
  } else if (a.eventos.length === 0) {
    cuerpo += `<p style="margin:8px 0 0;font-size:12px;color:${C.gris};">Sin eventos en el calendario hoy.</p>`
  } else {
    cuerpo += `<p style="margin:10px 0 4px;font-size:12px;font-weight:600;color:${C.texto};">Calendario</p>`
    cuerpo += tabla(
      ['Evento', 'Horario'],
      a.eventos.map(e => [e.titulo, `${e.horaInicio}–${e.horaFin}`]),
      ['left', 'right']
    )
  }
  return tarjeta('Agenda de hoy', cuerpo)
}

/** Arma el mail completo. Cualquier bloque null sale con su nota de fallback. */
export function armarInformeDiario(datos: DatosInforme): { html: string; texto: string } {
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f9fafb;font-family:${FUENTE};">
<div style="max-width:680px;margin:0 auto;padding:16px;">
  <div style="background:${C.magenta};border-radius:12px;padding:14px 18px;margin-bottom:16px;">
    <p style="margin:0;font-size:16px;font-weight:700;color:#ffffff;">GOcelular360 — Informe diario</p>
    <p style="margin:2px 0 0;font-size:12px;color:#fbcfe8;">${datos.fecha}</p>
  </div>
  ${bloqueVentas(datos)}
  ${bloqueForecast(datos)}
  ${bloqueSeguros(datos)}
  ${bloqueCaja(datos)}
  ${bloquePD(datos)}
  ${bloqueIncobrabilidad(datos)}
  ${bloqueDeposito(datos)}
  ${bloqueAgenda(datos)}
  <p style="margin:8px 0 0;font-size:11px;color:${C.gris};text-align:center;">
    <a href="https://goabl.app" style="color:${C.magenta};">goabl.app</a>
  </p>
</div>
</body></html>`

  const lineas: string[] = [`GOcelular360 — Informe diario ${datos.fecha}`]
  if (datos.ventas) {
    lineas.push(`Ventas ayer: propia ${datos.ventas.propia.ordenes} (${moneda(datos.ventas.propia.monto)}), terceros ${datos.ventas.terceros.ordenes} (${moneda(datos.ventas.terceros.monto)})`)
  }
  if (datos.forecast) lineas.push(`Forecast: ${datos.forecast.veredicto.frase}`)
  if (datos.seguros) lineas.push(`Seguros: ${datos.seguros.emitidas} pólizas, ${datos.seguros.siniestros} siniestros`)
  if (datos.caja && datos.caja.length > 0) lineas.push(`Caja mínima 7d: ${moneda(Math.min(...datos.caja.map(c => c.saldo)))}`)
  lineas.push('Ver el detalle en el mail con formato o en goabl.app')

  return { html, texto: lineas.join('\n') }
}
