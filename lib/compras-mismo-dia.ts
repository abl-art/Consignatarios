// Detector de compras múltiples el mismo día por sucursal (señal de fraude
// de mostrador / venta coordinada, caso RIIING La Banda oct 2026).
// Un "caso" = un DNI con 2+ órdenes confirmadas el mismo día en la misma
// tienda. Un caso aislado por mes es ruido de fondo; la alerta busca el
// CAMBIO DE RITMO: tiendas con 2+ casos en los últimos 30 días, y marca en
// rojo cuando el ritmo reciente triplica el histórico de esa tienda.

export interface CasoMismoDia {
  storeName: string
  clientId: string
  userDni: string
  userName: string
  fecha: string // YYYY-MM-DD
  ordenes: number
  monto: number
  sinActivar: number
  bloqueados: number
  primeraVentaStore: string // YYYY-MM-DD
}

export interface StoreMismoDia {
  storeName: string
  clientId: string
  casos30: number
  ordenes30: number
  monto30: number
  sinActivar30: number
  ritmoPrevio: number // casos por mes antes de la ventana
  nivel: 'rojo' | 'ambar'
  casos: CasoMismoDia[] // solo los de la ventana, más recientes primero
}

const DIA_MS = 86_400_000
export const VENTANA_DIAS_MISMO_DIA = 30

export function armarComprasMismoDia(
  casos: CasoMismoDia[],
  hoy: Date,
  ventanaDias: number = VENTANA_DIAS_MISMO_DIA,
): StoreMismoDia[] {
  const inicioVentana = new Date(hoy.getTime() - ventanaDias * DIA_MS)
  const porStore = new Map<string, CasoMismoDia[]>()
  for (const c of casos) {
    const arr = porStore.get(c.storeName) ?? []
    arr.push(c)
    porStore.set(c.storeName, arr)
  }

  const resultado: StoreMismoDia[] = []
  for (const [storeName, lista] of porStore) {
    const recientes = lista
      .filter(c => new Date(c.fecha + 'T00:00:00') >= inicioVentana)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
    if (recientes.length < 2) continue

    const previos = lista.filter(c => new Date(c.fecha + 'T00:00:00') < inicioVentana)
    // Ritmo histórico: casos previos / meses de vida de la tienda hasta el
    // inicio de la ventana (mínimo 1 mes, para no dividir por ~0 en tiendas nuevas)
    const primeraVenta = new Date(lista[0].primeraVentaStore + 'T00:00:00')
    const mesesPrevios = Math.max(1, (inicioVentana.getTime() - primeraVenta.getTime()) / (30 * DIA_MS))
    const ritmoPrevio = Math.round((previos.length / mesesPrevios) * 10) / 10

    const casos30 = recientes.length
    const nivel: 'rojo' | 'ambar' =
      casos30 >= 3 && casos30 >= 3 * Math.max(ritmoPrevio, 0.5) ? 'rojo' : 'ambar'

    resultado.push({
      storeName,
      clientId: lista[0].clientId,
      casos30,
      ordenes30: recientes.reduce((s, c) => s + c.ordenes, 0),
      monto30: recientes.reduce((s, c) => s + c.monto, 0),
      sinActivar30: recientes.reduce((s, c) => s + c.sinActivar, 0),
      ritmoPrevio,
      nivel,
      casos: recientes,
    })
  }

  return resultado.sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel === 'rojo' ? -1 : 1
    return b.casos30 - a.casos30
  })
}
