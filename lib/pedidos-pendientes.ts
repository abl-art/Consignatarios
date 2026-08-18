// Columna "Pedido" de /inventario/stock: unidades compradas en el gestor de
// pedidos que todavía no se informaron a GOcelular. Al informarse, GOcelular
// crea el inventario en tránsito y pasan solas a la columna "En tránsito" —
// cada unidad cuenta en una sola columna.
//
// El mapeo a filas de stock es por nombre normalizado: los productoCodigo del
// gestor son inconsistentes. Se tolera el prefijo de RAM que el gestor incluye
// y GOcelular no ("Galaxy A17 4/128GB" ≈ "Galaxy A17 128GB"). Un modelo sin
// fila de stock (nunca ingresó) genera una fila nueva con solo el pedido.

import type { StockWarehouseRow } from './gocelular'
import { categoriaAccesorio } from './categoria-accesorio'
import { normalizarMarca } from './marca'

export interface PedidoGestor {
  estado: 'borrador' | 'confirmado' | 'enviado'
  items: { productoNombre: string; cantidad: number }[]
  ingresoStockAt?: string
  gocelular?: { estado?: string }
}

export type StockConPedidoRow = StockWarehouseRow & { pedido: number }

function claves(nombre: string): string[] {
  // GOcelular antepone "Celular" en algunos modelos; el gestor no
  const base = nombre.toLowerCase().replace(/^celular\s+/, '')
  const sinRam = base.replace(/\b\d+\s*\/\s*(?=\d)/g, '')
  const limpiar = (s: string) => s.replace(/[^a-z0-9]/g, '')
  const c1 = limpiar(base)
  const c2 = limpiar(sinRam)
  return c1 === c2 ? [c1] : [c1, c2]
}

function pendiente(p: PedidoGestor): boolean {
  return (
    (p.estado === 'confirmado' || p.estado === 'enviado') &&
    !p.ingresoStockAt &&
    p.gocelular?.estado !== 'informado'
  )
}

export function aplicarPedidos(rows: StockWarehouseRow[], pedidos: PedidoGestor[]): StockConPedidoRow[] {
  // cantidad pedida por nombre crudo (para crear filas nuevas con nombre lindo)
  const porNombre = new Map<string, number>()
  for (const p of pedidos.filter(pendiente)) {
    for (const it of p.items ?? []) {
      const nombre = it.productoNombre.trim()
      if (!nombre) continue
      porNombre.set(nombre, (porNombre.get(nombre) ?? 0) + it.cantidad)
    }
  }

  // índice de filas por todas sus claves
  const porClave = new Map<string, StockConPedidoRow>()
  const resultado: StockConPedidoRow[] = rows.map((r) => ({ ...r, pedido: 0 }))
  for (const r of resultado) {
    for (const c of claves(r.nombre)) if (!porClave.has(c)) porClave.set(c, r)
  }

  for (const [nombre, cantidad] of porNombre) {
    const match = claves(nombre).map((c) => porClave.get(c)).find(Boolean)
    if (match) {
      match.pedido += cantidad
    } else {
      const nueva: StockConPedidoRow = {
        sku: '—',
        nombre,
        whAndreani: 0,
        whGocuotas: 0,
        enTransito: 0,
        enTransitoDesde: null,
        total: 0,
        tipo: categoriaAccesorio('', nombre) === 'otro' ? 'celular' : 'accesorio',
        marca: normalizarMarca(nombre.split(/\s+/)[0] ?? null),
        pedido: cantidad,
      }
      resultado.push(nueva)
      for (const c of claves(nombre)) if (!porClave.has(c)) porClave.set(c, nueva)
    }
  }

  return resultado
}
