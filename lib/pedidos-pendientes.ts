// Columnas "Pedido" y "En tránsito" de /inventario/stock según el gestor de
// pedidos, para no depender del procesamiento de GOcelular:
//   Pedido      = confirmado/enviado todavía sin informar a GOcelular
//   En tránsito = informado a GOcelular y sin ingreso al depósito. GOcelular
//                 crea su propio inventario en tránsito al procesar el informe,
//                 pero puede demorar o trabarse (alias pendiente): por fila se
//                 toma el MÁXIMO entre su tránsito y el del gestor, así las
//                 unidades aparecen apenas se informa y no se duplican después.
//
// El mapeo a filas de stock intenta primero por productoCodigo == sku (exacto
// e inmune a renames del producto: el pedido congela el nombre al crearse) y
// cae al nombre normalizado cuando el código no figura — los productoCodigo
// del gestor no siempre coinciden con GOcelular. En el nombre se tolera el
// prefijo de RAM que el gestor incluye y GOcelular no ("Galaxy A17 4/128GB" ≈
// "Galaxy A17 128GB"). Un modelo sin fila de stock genera una fila nueva.

import type { StockWarehouseRow } from './gocelular'
import { categoriaAccesorio } from './categoria-accesorio'
import { normalizarMarca } from './marca'

export interface PedidoGestor {
  id?: string
  estado: 'borrador' | 'confirmado' | 'enviado'
  items: { productoNombre: string; productoCodigo?: string; cantidad: number }[]
  ingresoStockAt?: string
  gocelular?: { estado?: string; enviadoAt?: string }
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

function activo(p: PedidoGestor): boolean {
  return (p.estado === 'confirmado' || p.estado === 'enviado') && !p.ingresoStockAt
}

function sumarItems(destino: Map<string, number>, p: PedidoGestor, codigoPorNombre: Map<string, string>) {
  for (const it of p.items ?? []) {
    const nombre = it.productoNombre.trim()
    if (!nombre) continue
    destino.set(nombre, (destino.get(nombre) ?? 0) + it.cantidad)
    const codigo = it.productoCodigo?.trim()
    if (codigo && !codigoPorNombre.has(nombre)) codigoPorNombre.set(nombre, codigo)
  }
}

function filaNueva(nombre: string): StockConPedidoRow {
  return {
    sku: '—',
    nombre,
    whAndreani: 0,
    whGocuotas: 0,
    enTransito: 0,
    enTransitoDesde: null,
    total: 0,
    tipo: categoriaAccesorio('', nombre) === 'otro' ? 'celular' : 'accesorio',
    marca: normalizarMarca(nombre.split(/\s+/)[0] ?? null),
    pedido: 0,
  }
}

export function aplicarPedidos(
  rows: StockWarehouseRow[],
  pedidos: PedidoGestor[],
): StockConPedidoRow[] {
  // cantidades por nombre crudo (para crear filas nuevas con nombre lindo)
  const pedidoPorNombre = new Map<string, number>()
  const transitoPorNombre = new Map<string, number>()
  const transitoDesde = new Map<string, string>()
  const codigoPorNombre = new Map<string, string>()
  for (const p of pedidos.filter(activo)) {
    if (p.gocelular?.estado === 'informado') {
      sumarItems(transitoPorNombre, p, codigoPorNombre)
      if (p.gocelular.enviadoAt) {
        for (const it of p.items ?? []) {
          const nombre = it.productoNombre.trim()
          const previo = transitoDesde.get(nombre)
          if (!previo || p.gocelular.enviadoAt < previo) transitoDesde.set(nombre, p.gocelular.enviadoAt)
        }
      }
    } else {
      sumarItems(pedidoPorNombre, p, codigoPorNombre)
    }
  }

  // índice de filas por sku y por todas sus claves de nombre
  const porClave = new Map<string, StockConPedidoRow>()
  const porSku = new Map<string, StockConPedidoRow>()
  const resultado: StockConPedidoRow[] = rows.map((r) => ({ ...r, pedido: 0 }))
  for (const r of resultado) {
    if (r.sku && r.sku !== '—' && !porSku.has(r.sku)) porSku.set(r.sku, r)
    for (const c of claves(r.nombre)) if (!porClave.has(c)) porClave.set(c, r)
  }

  const filaPara = (nombre: string): StockConPedidoRow => {
    const codigo = codigoPorNombre.get(nombre)
    const porCodigo = codigo ? porSku.get(codigo) : undefined
    if (porCodigo) return porCodigo
    const match = claves(nombre).map((c) => porClave.get(c)).find(Boolean)
    if (match) return match
    const nueva = filaNueva(nombre)
    resultado.push(nueva)
    for (const c of claves(nombre)) if (!porClave.has(c)) porClave.set(c, nueva)
    return nueva
  }

  for (const [nombre, cantidad] of pedidoPorNombre) {
    filaPara(nombre).pedido += cantidad
  }

  for (const [nombre, cantidad] of transitoPorNombre) {
    const fila = filaPara(nombre)
    fila.enTransito = Math.max(fila.enTransito, cantidad)
    if (!fila.enTransitoDesde) fila.enTransitoDesde = transitoDesde.get(nombre) ?? null
  }

  return resultado
}
