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

describe('pedidos informados cuentan como En tránsito con datos del gestor', () => {
  it('un informado sin ingreso pasa a En tránsito, no a Pedido, sin esperar a GOcelular', () => {
    const p = pedido({ gocelular: { estado: 'informado', enviadoAt: '2026-08-25T13:44:18.449Z' } })
    const rows = aplicarPedidos([fila()], [p])
    expect(rows[0].pedido).toBe(0)
    expect(rows[0].enTransito).toBe(90)
    expect(rows[0].enTransitoDesde).toBe('2026-08-25T13:44:18.449Z')
  })

  it('no duplica cuando GOcelular ya creó el tránsito: toma el máximo', () => {
    const p = pedido({ gocelular: { estado: 'informado' } })
    const rows = aplicarPedidos([fila({ enTransito: 90, enTransitoDesde: '2026-08-20T00:00:00.000Z' })], [p])
    expect(rows[0].enTransito).toBe(90)
    // el desde de GOcelular (creación real del inventario) se conserva
    expect(rows[0].enTransitoDesde).toBe('2026-08-20T00:00:00.000Z')
  })

  it('si GOcelular creó menos unidades que las informadas (alias trabado) manda el gestor', () => {
    // Kinito 25/8: 220 informadas, GOcelular aceptó 210 y dejó 10 en alias pendiente
    const p = pedido({ gocelular: { estado: 'informado' } })
    const rows = aplicarPedidos([fila({ enTransito: 80 })], [p])
    expect(rows[0].enTransito).toBe(90)
  })

  it('un modelo informado sin fila de stock genera fila nueva en tránsito', () => {
    const p = pedido({
      gocelular: { estado: 'informado', enviadoAt: '2026-08-25T13:44:18.449Z' },
      items: [{ productoNombre: 'Motorola Moto G67 4/256GB', cantidad: 10 }],
    })
    const rows = aplicarPedidos([fila()], [p])
    expect(rows).toHaveLength(2)
    expect(rows[1].nombre).toBe('Motorola Moto G67 4/256GB')
    expect(rows[1].enTransito).toBe(10)
    expect(rows[1].enTransitoDesde).toBe('2026-08-25T13:44:18.449Z')
    expect(rows[1].pedido).toBe(0)
  })

  it('matchea por productoCodigo == sku aunque el nombre del item sea viejo (Nubia Neo 3GT 31/8)', () => {
    // El pedido congeló "Nubia Neo 3GT" antes del rename a "Nubia Neo 3GT 12/256 GB":
    // el nombre no matchea, pero el código NUB-NEO3GT es exactamente el sku de la fila
    const p = pedido({
      gocelular: { estado: 'informado', enviadoAt: '2026-08-31T17:22:03.752Z' },
      items: [{ productoNombre: 'Nubia Neo 3GT', productoCodigo: 'NUB-NEO3GT', cantidad: 100 }],
    })
    const rows = aplicarPedidos(
      [fila({ sku: 'NUB-NEO3GT', nombre: 'Nubia Neo 3GT 12/256 GB', marca: 'Nubia', enTransito: 100 })],
      [p],
    )
    expect(rows).toHaveLength(1) // sin fila fantasma duplicada
    expect(rows[0].enTransito).toBe(100) // máximo, no suma
  })

  it('un codigo que no figura como sku cae al match por nombre', () => {
    const p = pedido({ items: [{ productoNombre: 'Xiaomi Redmi 14C 256/4 GB', productoCodigo: 'CODIGO-INVENTADO', cantidad: 15 }] })
    const rows = aplicarPedidos([fila()], [p])
    expect(rows).toHaveLength(1)
    expect(rows[0].pedido).toBe(15)
  })

  it('el match por codigo también aplica a la columna Pedido', () => {
    const p = pedido({ items: [{ productoNombre: 'Nombre Viejo Cualquiera', productoCodigo: 'XIA-14C', cantidad: 20 }] })
    const rows = aplicarPedidos([fila()], [p])
    expect(rows).toHaveLength(1)
    expect(rows[0].pedido).toBe(20)
  })

  it('un informado con ingreso completo no cuenta en tránsito ni en pedido', () => {
    const p = pedido({ ingresoStockAt: '2026-08-21', gocelular: { estado: 'informado' } })
    const rows = aplicarPedidos([fila()], [p])
    expect(rows[0].pedido).toBe(0)
    expect(rows[0].enTransito).toBe(0)
  })
})
