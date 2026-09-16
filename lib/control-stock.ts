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
