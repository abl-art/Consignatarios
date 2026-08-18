import { describe, it, expect } from 'vitest'
import { armarAsns, type AsnTransaccion, type AsnCelularRow, type AsnAccesorioRow } from '@/lib/asn'

const tx = (over: Partial<AsnTransaccion> = {}): AsnTransaccion => ({
  id: 'tx-1',
  id_transaccion: '16626683',
  numero_orden_externa: 'orden-1',
  estado: 'accepted',
  fecha: '2026-08-14',
  ...over,
})

describe('armarAsns', () => {
  it('agrupa celulares y accesorios por ASN con su avance de ingreso', () => {
    const cel: AsnCelularRow[] = [
      { asn_transaction_id: 'tx-1', modelo: 'Moto G06 4/128GB', unidades: 340, en_transito: 340 },
      { asn_transaction_id: 'tx-1', modelo: 'Redmi 14C', unidades: 20, en_transito: 0 },
    ]
    const acc: AsnAccesorioRow[] = [
      { asn_transaction_id: 'tx-1', sku: 'KS-SAM-A17', cantidad: 250, recibidas: 100 },
    ]
    const [asn] = armarAsns([tx()], cel, acc)
    expect(asn.totalUnidades).toBe(610)
    expect(asn.ingresadas).toBe(120) // 0 + 20 + 100
    expect(asn.pendientes).toBe(490) // 340 + 0 + 150
    expect(asn.items).toEqual([
      { tipo: 'celular', descripcion: 'Moto G06 4/128GB', cantidad: 340, ingresadas: 0 },
      { tipo: 'celular', descripcion: 'Redmi 14C', cantidad: 20, ingresadas: 20 },
      { tipo: 'accesorio', descripcion: 'KS-SAM-A17', cantidad: 250, ingresadas: 100 },
    ])
  })

  it('ordena del más nuevo al más viejo y conserva estado y datos de la transacción', () => {
    const viejo = tx({ id: 'tx-a', id_transaccion: '111', fecha: '2026-08-04', estado: 'rejected' })
    const nuevo = tx({ id: 'tx-b', id_transaccion: '222', fecha: '2026-08-14' })
    const asns = armarAsns([viejo, nuevo], [], [])
    expect(asns.map((a) => a.id_transaccion)).toEqual(['222', '111'])
    expect(asns[1].estado).toBe('rejected')
    expect(asns[0].orden).toBe('orden-1')
  })

  it('un ASN sin items queda con totales en cero', () => {
    const [asn] = armarAsns([tx()], [], [])
    expect(asn.totalUnidades).toBe(0)
    expect(asn.pendientes).toBe(0)
    expect(asn.items).toEqual([])
  })

  it('la cantidad recibida de un accesorio nunca supera la pedida', () => {
    const acc: AsnAccesorioRow[] = [{ asn_transaction_id: 'tx-1', sku: 'KS-X', cantidad: 10, recibidas: 15 }]
    const [asn] = armarAsns([tx()], [], acc)
    expect(asn.ingresadas).toBe(10)
    expect(asn.pendientes).toBe(0)
  })
})
