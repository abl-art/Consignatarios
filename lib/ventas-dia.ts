import { CLIENT_IDS_PROPIOS } from './client-ids'

// Ventas agrupadas por store (misma forma que VentaDiaria de lib/gocelular.ts,
// sirve tanto para el día como para un acumulado de 30 días)
export interface VentaAgrupada {
  store_name: string
  client_id: string
  ventas: number
  monto: number
}

export interface ConsignatarioPrefix {
  nombre: string
  prefix: string
}

interface Cifras {
  ventas: number
  monto: number
}

export interface ResumenVentasDia {
  hoy: { gocelular: Cifras; terceros: Cifras; total: Cifras }
  prom30d: { gocelular: Cifras; terceros: Cifras; general: Cifras }
}

type Canal = 'gocelular' | 'consignatarios' | 'terceros'

function clasificar(v: VentaAgrupada, prefixes: ConsignatarioPrefix[]): Canal {
  if (CLIENT_IDS_PROPIOS.includes(v.client_id)) return 'gocelular'
  const lower = v.store_name.toLowerCase()
  if (prefixes.some((p) => lower.startsWith(p.prefix.toLowerCase()))) return 'consignatarios'
  return 'terceros'
}

function sumar(ventas: VentaAgrupada[], canal: Canal, prefixes: ConsignatarioPrefix[]): Cifras {
  return ventas
    .filter((v) => clasificar(v, prefixes) === canal)
    .reduce((acc, v) => ({ ventas: acc.ventas + v.ventas, monto: acc.monto + v.monto }), { ventas: 0, monto: 0 })
}

const DIAS = 30

/**
 * Resume la tarjeta "Ventas del día": cifras de hoy por canal (sin
 * consignatarios, modelo en baja) y promedios diarios sobre los últimos
 * 30 días calendario (se divide siempre por 30, incluyendo días sin ventas).
 */
export function resumenVentasDia(
  ventasHoy: VentaAgrupada[],
  ventasUlt30d: VentaAgrupada[],
  prefixes: ConsignatarioPrefix[]
): ResumenVentasDia {
  const hoyGo = sumar(ventasHoy, 'gocelular', prefixes)
  const hoyTerceros = sumar(ventasHoy, 'terceros', prefixes)

  const promGo = promediar(sumar(ventasUlt30d, 'gocelular', prefixes))
  const promTerceros = promediar(sumar(ventasUlt30d, 'terceros', prefixes))

  return {
    hoy: {
      gocelular: hoyGo,
      terceros: hoyTerceros,
      total: { ventas: hoyGo.ventas + hoyTerceros.ventas, monto: hoyGo.monto + hoyTerceros.monto },
    },
    prom30d: {
      gocelular: promGo,
      terceros: promTerceros,
      general: { ventas: promGo.ventas + promTerceros.ventas, monto: promGo.monto + promTerceros.monto },
    },
  }
}

function promediar(total: Cifras): Cifras {
  return { ventas: total.ventas / DIAS, monto: total.monto / DIAS }
}

export interface VentaMensual extends VentaAgrupada {
  mes: string // 'YYYY-MM'
}

export interface ProyeccionVentas {
  promedioMensualCerrado: Cifras
  mesesCerrados: number
  proyeccion: { mes: string; ventas: number; monto: number }[]
}

/**
 * Proyecta los meses restantes del año con una regresión lineal sobre los
 * meses cerrados (enero → mes anterior al actual; el mes en curso queda fuera
 * por incompleto). Meses sin ventas cuentan como cero. Excluye consignatarios
 * (modelo en baja); la proyección nunca baja de cero.
 */
export function proyectarVentasMensuales(
  mensuales: VentaMensual[],
  prefixes: ConsignatarioPrefix[],
  mesActual: string // 'YYYY-MM'
): ProyeccionVentas {
  const [anio, mesNum] = mesActual.split('-').map(Number)
  const cerrados = mesNum - 1

  const clave = (m: number) => `${anio}-${String(m).padStart(2, '0')}`
  const serie: Cifras[] = []
  for (let m = 1; m <= cerrados; m++) {
    const delMes = mensuales.filter((v) => v.mes === clave(m) && clasificar(v, prefixes) !== 'consignatarios')
    serie.push(delMes.reduce((acc, v) => ({ ventas: acc.ventas + v.ventas, monto: acc.monto + v.monto }), { ventas: 0, monto: 0 }))
  }

  const ajusteVentas = ajustarRecta(serie.map((c) => c.ventas))
  const ajusteMonto = ajustarRecta(serie.map((c) => c.monto))

  const proyeccion = []
  for (let m = mesNum + 1; m <= 12; m++) {
    proyeccion.push({
      mes: clave(m),
      ventas: Math.max(0, ajusteVentas.a + ajusteVentas.b * m),
      monto: Math.max(0, ajusteMonto.a + ajusteMonto.b * m),
    })
  }

  const total = serie.reduce((acc, c) => ({ ventas: acc.ventas + c.ventas, monto: acc.monto + c.monto }), { ventas: 0, monto: 0 })
  return {
    promedioMensualCerrado: cerrados > 0 ? { ventas: total.ventas / cerrados, monto: total.monto / cerrados } : { ventas: 0, monto: 0 },
    mesesCerrados: cerrados,
    proyeccion,
  }
}

// Cuadrados mínimos sobre y = a + b·x con x = 1..n. Con menos de 2 puntos
// no hay pendiente: devuelve la media (o cero) como recta plana.
function ajustarRecta(ys: number[]): { a: number; b: number } {
  const n = ys.length
  if (n === 0) return { a: 0, b: 0 }
  const media = ys.reduce((s, y) => s + y, 0) / n
  if (n === 1) return { a: media, b: 0 }

  const mediaX = (n + 1) / 2
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    const dx = i + 1 - mediaX
    sxy += dx * (ys[i] - media)
    sxx += dx * dx
  }
  const b = sxy / sxx
  return { a: media - b * mediaX, b }
}
