// Agregación por modelo de un corte del control de stock Andreani vs
// GOcelular: los color-SKUs del mismo modelo se compensan entre sí (stock
// cargado en otro color no es faltante real). El vendido EN COLA solo existe
// a nivel modelo (sin color asignado) y define el disponible real de venta.

export interface FilaCorte {
  nombre: string | null
  and_disponible: number
  go_andreani: number
  go_enviados: number
  medido: boolean
}

export interface ModeloNeto {
  nombre: string
  skus: number
  andDisponible: number
  /** available en WH Andreani − pedidos enviados sin pickear */
  goComparable: number
  /** andDisponible − goComparable */
  dif: number
  enCola: number
  /** andDisponible − enCola: lo que de verdad queda para vender */
  disponibleReal: number
}

/**
 * Estado de una diferencia según su persistencia entre cortes:
 * - nueva: primera aparición — indistinguible de timing hasta el próximo corte
 * - real: sobrevivió ≥2 cortes consecutivos con el mismo signo
 * - resuelta: desapareció (o cambió de signo) en el corte siguiente — fue timing
 * - persistia: en un corte histórico, la dif seguía viva en el corte siguiente
 */
export type EstadoDif = 'nueva' | 'real' | 'resuelta' | 'persistia'

export interface DifClasificada {
  nombre: string
  dif: number
  estado: EstadoDif
  /** runAt del primer corte de la racha consecutiva con el mismo signo */
  desde: string
  /** largo de la racha hasta este corte inclusive */
  cortes: number
  /** unidades del modelo recibidas en el WH en las 48h previas al corte (contexto putaway) */
  recepcion48h: number
}

export interface CorteClasificado {
  runAt: string
  difs: DifClasificada[]
}

export interface CorteParaClasificar {
  runAt: string
  modelos: ModeloNeto[]
  recepciones?: { nombre: string; unidades: number }[]
}

/**
 * Clasifica las diferencias de cada corte por persistencia. Sin log de
 * movimientos de Andreani no se puede reconstruir la causa de una dif en el
 * momento: la única definición operativa de "temporal" es que desaparezca
 * sola en el corte siguiente. Solo el último corte lleva nueva/real (es el
 * accionable); los históricos llevan resuelta/persistia (retro-etiqueta).
 */
export function clasificarCortes(cortes: CorteParaClasificar[]): CorteClasificado[] {
  const asc = [...cortes].sort((a, b) => a.runAt.localeCompare(b.runAt))
  const difDe = asc.map(c => new Map(c.modelos.filter(m => m.dif !== 0).map(m => [m.nombre, m.dif])))

  return asc.map((c, i) => {
    const recepcionDe = new Map((c.recepciones ?? []).map(r => [r.nombre, r.unidades]))
    const difs: DifClasificada[] = []
    for (const [nombre, dif] of difDe[i]) {
      // Racha hacia atrás: cortes consecutivos anteriores con dif del mismo signo
      let inicio = i
      while (inicio > 0 && Math.sign(difDe[inicio - 1].get(nombre) ?? 0) === Math.sign(dif)) inicio--
      const racha = i - inicio + 1

      let estado: EstadoDif
      if (i === asc.length - 1) {
        estado = racha >= 2 ? 'real' : 'nueva'
      } else {
        estado = Math.sign(difDe[i + 1].get(nombre) ?? 0) === Math.sign(dif) ? 'persistia' : 'resuelta'
      }

      difs.push({
        nombre,
        dif,
        estado,
        desde: asc[inicio].runAt,
        cortes: racha,
        recepcion48h: recepcionDe.get(nombre) ?? 0,
      })
    }
    difs.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif) || a.nombre.localeCompare(b.nombre))
    return { runAt: c.runAt, difs }
  })
}

export function netoPorModelo(
  filas: FilaCorte[],
  enCola: { nombre: string; unidades: number }[],
): ModeloNeto[] {
  const enColaDe = new Map(enCola.map(e => [e.nombre, e.unidades]))
  const porModelo = new Map<string, { andDisponible: number; goComparable: number; skus: number }>()
  for (const f of filas) {
    if (!f.medido) continue
    const nombre = f.nombre ?? '—'
    const m = porModelo.get(nombre) ?? { andDisponible: 0, goComparable: 0, skus: 0 }
    m.andDisponible += f.and_disponible
    m.goComparable += f.go_andreani - f.go_enviados
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
