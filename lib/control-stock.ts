// Agregación por modelo de un corte del control de stock Andreani vs
// GOcelular: los color-SKUs del mismo modelo se compensan entre sí (stock
// cargado en otro color no es faltante real). El vendido EN COLA solo existe
// a nivel modelo (sin color asignado) y define el disponible real de venta.
//
// El comparable GO es available en andreani_wh SIN restar la cola de enviados
// sin pickear. Verificado contra el export del portal de Andreani (17/9): su
// "Cantidad Disponible" = físico − pickeado/embalado, NO descuenta los pedidos
// enviados que todavía no pickeó. Restar esa cola del lado GO fabricaba difs
// positivas del tamaño de la cola. La dif residual real son los despachos sin
// IMEI (GO infla available) y los cruces de color (netean a nivel modelo).

export interface FilaCorte {
  nombre: string | null
  and_total: number
  and_disponible: number
  go_andreani: number
  go_enviados: number
  medido: boolean
}

export interface ModeloNeto {
  nombre: string
  skus: number
  /** stock TOTAL que Andreani reconoce (físico ingresado, ubicado o no) */
  andTotal: number
  andDisponible: number
  /** available en WH Andreani (SIN restar la cola de enviados: Andreani
   * tampoco la descuenta de su disponible — verificado contra el portal) */
  goComparable: number
  /** andDisponible − goComparable */
  dif: number
  enCola: number
  /** andDisponible − enCola: lo que de verdad queda para vender */
  disponibleReal: number
}

/**
 * Un modelo con su diferencia descompuesta en causas conocidas + residual.
 * La suma de las causas nunca excede |dif| (cap: no explicar más de lo que la
 * dif muestra — si sobran fantasmas listados es que ya se resolvieron).
 */
export interface ModeloDescompuesto extends ModeloNeto {
  /** unidades de la dif explicadas por despachos sin IMEI conocidos (lista Pedro) */
  fantasmas: number
  /** unidades explicadas por recepción que Andreani no ingresó a su total (putaway) */
  putaway: number
  /** lo que queda sin explicar = lag de novedad pendiente o fantasma no catalogado */
  residual: number
}

/**
 * Estado de una diferencia según la persistencia de su RESIDUAL entre cortes
 * (el residual = la dif menos las causas conocidas fantasma/putaway):
 * - nueva: primera aparición — indistinguible de lag hasta el próximo corte
 * - real: el residual sobrevivió ≥2 cortes consecutivos con el mismo signo
 * - resuelta: desapareció (o cambió de signo) en el corte siguiente — era lag/timing
 * - persistia: en un corte histórico, el residual seguía vivo en el corte siguiente
 */
export type EstadoDif = 'nueva' | 'real' | 'resuelta' | 'persistia'

export interface DifClasificada {
  nombre: string
  /** dif cruda del modelo (andDisponible − goComparable) */
  dif: number
  /** unidades explicadas por despachos sin IMEI conocidos */
  fantasmas: number
  /** unidades explicadas por putaway (recepción sin ingresar por Andreani) */
  putaway: number
  /** lo que se clasifica: la dif sin las causas conocidas */
  residual: number
  estado: EstadoDif
  /** runAt del primer corte de la racha consecutiva del residual con el mismo signo */
  desde: string
  /** largo de la racha hasta este corte inclusive */
  cortes: number
  /** unidades del modelo recibidas en el WH en las 48h previas al corte (contexto) */
  recepcion48h: number
}

export interface CorteClasificado {
  runAt: string
  difs: DifClasificada[]
}

export interface CorteParaClasificar {
  runAt: string
  modelos: ModeloDescompuesto[]
  recepciones?: { nombre: string; unidades: number }[]
}

/**
 * Clasifica el RESIDUAL de cada modelo por persistencia entre cortes. La
 * descomposición ya sacó las causas conocidas (fantasmas, putaway); lo que
 * queda es lag de novedad pendiente o faltante real, y la única forma de
 * separarlos es la persistencia: un residual que desaparece solo era lag.
 * Solo el último corte lleva nueva/real (accionable); los históricos llevan
 * resuelta/persistia (retro-etiqueta).
 */
export function clasificarCortes(cortes: CorteParaClasificar[]): CorteClasificado[] {
  const asc = [...cortes].sort((a, b) => a.runAt.localeCompare(b.runAt))
  const modeloDe = asc.map(c => new Map(c.modelos.map(m => [m.nombre, m])))
  const residualDe = asc.map(c => new Map(c.modelos.filter(m => m.residual !== 0).map(m => [m.nombre, m.residual])))

  return asc.map((c, i) => {
    const recepcionDe = new Map((c.recepciones ?? []).map(r => [r.nombre, r.unidades]))
    const difs: DifClasificada[] = []
    for (const [nombre, residual] of residualDe[i]) {
      // Racha hacia atrás: cortes consecutivos anteriores con residual del mismo signo
      let inicio = i
      while (inicio > 0 && Math.sign(residualDe[inicio - 1].get(nombre) ?? 0) === Math.sign(residual)) inicio--
      const racha = i - inicio + 1

      let estado: EstadoDif
      if (i === asc.length - 1) {
        estado = racha >= 2 ? 'real' : 'nueva'
      } else {
        estado = Math.sign(residualDe[i + 1].get(nombre) ?? 0) === Math.sign(residual) ? 'persistia' : 'resuelta'
      }

      const m = modeloDe[i].get(nombre)
      difs.push({
        nombre,
        dif: m?.dif ?? 0,
        fantasmas: m?.fantasmas ?? 0,
        putaway: m?.putaway ?? 0,
        residual,
        estado,
        desde: asc[inicio].runAt,
        cortes: racha,
        recepcion48h: recepcionDe.get(nombre) ?? 0,
      })
    }
    difs.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual) || a.nombre.localeCompare(b.nombre))
    return { runAt: c.runAt, difs }
  })
}

export function netoPorModelo(
  filas: FilaCorte[],
  enCola: { nombre: string; unidades: number }[],
): ModeloNeto[] {
  const enColaDe = new Map(enCola.map(e => [e.nombre, e.unidades]))
  const porModelo = new Map<string, { andTotal: number; andDisponible: number; goComparable: number; skus: number }>()
  for (const f of filas) {
    if (!f.medido) continue
    const nombre = f.nombre ?? '—'
    const m = porModelo.get(nombre) ?? { andTotal: 0, andDisponible: 0, goComparable: 0, skus: 0 }
    m.andTotal += f.and_total
    m.andDisponible += f.and_disponible
    m.goComparable += f.go_andreani
    m.skus++
    porModelo.set(nombre, m)
  }
  return [...porModelo.entries()]
    .map(([nombre, m]) => ({
      nombre,
      ...m,
      dif: m.andDisponible - m.goComparable,
      enCola: enColaDe.get(nombre) ?? 0,
      disponibleReal: m.andDisponible - (enColaDe.get(nombre) ?? 0),
    }))
    .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif) || a.nombre.localeCompare(b.nombre))
}

/**
 * Descompone la diferencia de cada modelo en fantasmas + putaway + residual.
 * Solo las diferencias NEGATIVAS (GO cuenta de más) se explican; una positiva
 * (Andreani cuenta de más) es un reingreso no registrado y va entera al residual.
 *
 * Imputación en orden de confianza, con cap = |dif| (nunca explicar de más):
 *  1. fantasmas conocidos (despachos sin IMEI, lista Pedro) — fuente dura
 *  2. putaway = lo que GO excede al TOTAL de Andreani (recepción sin ingresar),
 *     acotado por la recepción de las últimas 48h del modelo
 *  3. residual = lo que sobra sin explicar
 */
export function descomponerModelos(
  modelos: ModeloNeto[],
  fantasmasPorModelo: Map<string, number>,
  recepcionesPorModelo: Map<string, number>,
): ModeloDescompuesto[] {
  return modelos.map(m => {
    if (m.dif >= 0) {
      return { ...m, fantasmas: 0, putaway: 0, residual: m.dif }
    }
    let deuda = -m.dif
    const fantasmas = Math.min(fantasmasPorModelo.get(m.nombre) ?? 0, deuda)
    deuda -= fantasmas
    // GO cuenta más que el total que Andreani reconoce = recepción no ingresada.
    // Le quito lo ya atribuido a fantasmas (mismo exceso) para no contar doble.
    const exceso = Math.max(0, m.goComparable - m.andTotal - fantasmas)
    const putaway = Math.min(exceso, recepcionesPorModelo.get(m.nombre) ?? 0, deuda)
    deuda -= putaway
    return { ...m, fantasmas, putaway, residual: deuda === 0 ? 0 : -deuda }
  })
}
