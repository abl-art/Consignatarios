import { describe, it, expect } from 'vitest'
import { renderPruebaVentasBono } from '@/lib/pdf/prueba-ventas-bono'

describe('renderPruebaVentasBono', () => {
  it('genera un PDF válido con ventas y facturas pendientes', async () => {
    const buffer = await renderPruebaVentasBono({
      bono: {
        id: 'b1',
        productoId: 'p1',
        nombreModelo: 'Motorola Moto G17 4/128GB',
        monto: 50000,
        desde: '2026-08-01',
        hasta: '2026-09-15',
        cupo: 3,
      },
      ventas: [
        { fecha: '2026-08-02', imei: '350296481548212', modelo: 'Motorola Moto G17 4/128GB', factura: 'FB 00010-00010216' },
        { fecha: '2026-08-03', imei: '350296481550713', modelo: 'Motorola Moto G17 4/128GB', factura: null },
      ],
      vendidasTotales: 5,
      generadoEl: '2026-08-31',
    })
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1000)
  })
})
