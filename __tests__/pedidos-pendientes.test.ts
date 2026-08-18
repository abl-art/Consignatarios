import { describe, it, expect } from 'vitest'
import { aplicarPedidos, type PedidoGestor } from '@/lib/pedidos-pendientes'
import type { StockWarehouseRow } from '@/lib/gocelular'

function fila(over: Partial<StockWarehouseRow> = {}): StockWarehouseRow {
  return {
    sku: 'XIA-14C',
    nombre: 'Xiaomi Redmi 14C 256/4 GB',
    whAndreani: 50,
    whGocuotas: 0,
    enTransito: 0,
    enTransitoDesde: null,
    total: 50,
    tipo: 'celular',
    marca: 'Xiaomi',
    ...over,
  }
}

function pedido(over: Partial<PedidoGestor> = {}): PedidoGestor {
  return {
    estado: 'enviado',
    items: [{ productoNombre: 'Xiaomi Redmi 14C 256/4 GB', cantidad: 90 }],
    ...over,
  }
}

describe('aplicarPedidos', () => {
  it('suma al match exacto por nombre normalizado (case/espacios)', () => {
    const rows = aplicarPedidos([fila()], [pedido()])
    expect(rows).toHaveLength(1)
    expect(rows[0].pedido).toBe(90)
  })

  it('solo cuenta pedidos confirmados/enviados sin informar y sin ingreso', () => {
    const pedidos: PedidoGestor[] = [
      pedido({ estado: 'borrador' }),
      pedido({ ingresoStockAt: '2026-08-01' }),
      pedido({ gocelular: { estado: 'informado' } }),
      pedido({ estado: 'confirmado', items: [{ productoNombre: 'Xiaomi Redmi 14C 256/4 GB', cantidad: 10 }] }),
    ]
    const rows = aplicarPedidos([fila()], pedidos)
    expect(rows[0].pedido).toBe(10)
  })

  it('tolera el prefijo de RAM del gestor ("4/128GB" matchea "128GB")', () => {
    const rows = aplicarPedidos(
      [fila({ nombre: 'Samsung Galaxy A17 128GB', marca: 'Samsung' })],
      [pedido({ items: [{ productoNombre: 'Samsung Galaxy A17 4/128GB', cantidad: 130 }] })]
    )
    expect(rows[0].pedido).toBe(130)
  })

  it('ignora el prefijo "Celular" que algunos modelos traen en GOcelular', () => {
    const rows = aplicarPedidos(
      [fila({ nombre: 'Celular Samsung Galaxy A17 4/128 GB', marca: 'Samsung' })],
      [pedido({ items: [{ productoNombre: 'Samsung Galaxy A17 4/128GB', cantidad: 130 }] })]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].pedido).toBe(130)
  })

  it('un modelo nuevo sin stock genera fila propia con solo el pedido cargado', () => {
    const rows = aplicarPedidos([fila()], [pedido({ items: [{ productoNombre: 'Nubia Air', cantidad: 150 }] })])
    expect(rows).toHaveLength(2)
    const nueva = rows[1]
    expect(nueva.nombre).toBe('Nubia Air')
    expect(nueva.pedido).toBe(150)
    expect(nueva.whAndreani).toBe(0)
    expect(nueva.enTransito).toBe(0)
    expect(nueva.tipo).toBe('celular')
    expect(nueva.marca).toBe('Nubia')
  })

  it('la fila nueva de un accesorio queda como accesorio', () => {
    const rows = aplicarPedidos([], [pedido({ items: [{ productoNombre: 'Auriculares Redmi Buds 7', cantidad: 500 }] })])
    expect(rows[0].tipo).toBe('accesorio')
  })

  it('acumula el mismo modelo en varios pedidos', () => {
    const rows = aplicarPedidos([fila()], [pedido(), pedido({ items: [{ productoNombre: 'xiaomi redmi 14c 256/4gb', cantidad: 10 }] })])
    expect(rows[0].pedido).toBe(100)
  })
})
