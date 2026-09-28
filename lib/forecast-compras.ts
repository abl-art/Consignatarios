import { normalizarModelo, type ReposicionModelo } from './inventario-indicadores'

export interface ItemVentaForecast {
  modelo: string
  ventaDiaria30: number
  stock: number
}

export interface FilaForecast {
  modelo: string
  ventas30d: number
  sharePct: number
  /** Disponible + en tránsito + pedidos del gestor (misma cuenta que Próx. cobertura) */
  pipeline: number
  demanda: { mes: string; unidades: number }[]
  aComprar: { mes: string; unidades: number }[]
  totalAComprar: number
}

export interface ForecastCompras {
  celulares: FilaForecast[]
  addons: FilaForecast[]
  /** Celulares vendidos por mes al ritmo de los últimos 30 días — la base del factor de escala */
  baselineMensual: number
}

/**
 * Porción de la proyección del mes en curso que falta transcurrir (los días
 * después de hoy): la demanda ya vendida no debe consumir pipeline otra vez.
 */
export function prorratearMesActual(unidadesMesCompleto: number, hoyISO: string): number {
  const [anio, mes, dia] = hoyISO.split('-').map(Number)
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return unidadesMesCompleto * ((diasDelMes - dia) / diasDelMes)
}

/**
 * Forecast de compras por modelo: el mix de ventas propias de los últimos
 * 30 días escala con la proyección congelada de venta propia. La demanda de
 * cada mes = venta 30d del ítem × (proyección del mes ÷ baseline de
 * celulares); los addons usan el mismo factor (attach constante sobre el
 * volumen de celulares). A comprar = demanda acumulada − pipeline, piso 0,
 * repartido en el mes en que el pipeline se agota.
 */
export function forecastCompras(
  celulares: ItemVentaForecast[],
  addons: ItemVentaForecast[],
  reposiciones: ReposicionModelo[],
  proyeccion: { mes: string; unidades: number }[]
): ForecastCompras {
  const baselineMensual = celulares.reduce((s, c) => s + c.ventaDiaria30, 0) * 30
  if (baselineMensual <= 0) return { celulares: [], addons: [], baselineMensual: 0 }

  const repoPorKey = new Map<string, number>()
  for (const r of reposiciones) {
    const key = normalizarModelo(r.modelo)
    repoPorKey.set(key, (repoPorKey.get(key) ?? 0) + r.enTransito + r.pedido)
  }

  const factores = proyeccion.map((p) => ({ mes: p.mes, factor: p.unidades / baselineMensual }))

  const armarGrupo = (items: ItemVentaForecast[]): FilaForecast[] => {
    const totalGrupo = items.reduce((s, i) => s + i.ventaDiaria30, 0)
    if (totalGrupo <= 0) return []

    return items
      .filter((i) => i.ventaDiaria30 > 0)
      .map((i) => {
        const mensual30d = i.ventaDiaria30 * 30
        const pipeline = i.stock + (repoPorKey.get(normalizarModelo(i.modelo)) ?? 0)
        const demanda = factores.map((f) => ({ mes: f.mes, unidades: mensual30d * f.factor }))

        let acumulada = 0
        let faltaPrevia = 0
        const aComprar = demanda.map((d) => {
          acumulada += d.unidades
          const falta = Math.max(0, acumulada - pipeline)
          const delMes = falta - faltaPrevia
          faltaPrevia = falta
          return { mes: d.mes, unidades: delMes }
        })

        return {
          modelo: i.modelo,
          ventas30d: mensual30d,
          sharePct: (i.ventaDiaria30 / totalGrupo) * 100,
          pipeline,
          demanda,
          aComprar,
          totalAComprar: faltaPrevia,
        }
      })
      .sort((a, b) => b.sharePct - a.sharePct)
  }

  return { celulares: armarGrupo(celulares), addons: armarGrupo(addons), baselineMensual }
}
