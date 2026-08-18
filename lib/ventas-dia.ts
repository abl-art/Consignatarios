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
