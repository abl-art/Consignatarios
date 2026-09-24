import { describe, it, expect } from 'vitest'
import { armarMixSegmentos, condicionesMixSegmentos, ordenarFilasMix, type CompradorCanal } from '@/lib/segmentos'
import { CLIENT_IDS_PROPIOS } from '@/lib/client-ids'

const u = (user_id: string, propia: boolean, terceros: boolean): CompradorCanal => ({
  user_id,
  compro_propia: propia,
  compro_terceros: terceros,
})

describe('armarMixSegmentos', () => {
  it('agrupa por segmento contando cada canal por separado y el total una vez', () => {
    const segmentos = new Map<string, string | null>([
      ['1', 'A1'],
      ['2', 'A1'],
      ['3', 'B4'],
    ])
    const mix = armarMixSegmentos([u('1', true, false), u('2', false, true), u('3', true, true)], segmentos)
    expect(mix.get('A1')).toEqual({ propia: 1, terceros: 1, total: 2 })
    // Compró en ambos canales: cuenta en los dos, pero una sola vez en total
    expect(mix.get('B4')).toEqual({ propia: 1, terceros: 1, total: 1 })
  })

  it('manda a S/D a los usuarios sin segmento o fuera del mapa', () => {
    const segmentos = new Map<string, string | null>([['1', null]])
    const mix = armarMixSegmentos([u('1', true, false), u('99', false, true)], segmentos)
    expect(mix.get('S/D')).toEqual({ propia: 1, terceros: 1, total: 2 })
    expect(mix.size).toBe(1)
  })

  it('sin compradores devuelve mapa vacío', () => {
    expect(armarMixSegmentos([], new Map()).size).toBe(0)
  })
})

describe('condicionesMixSegmentos', () => {
  it('solo fechas: rango con params posicionales', () => {
    expect(condicionesMixSegmentos({ desde: '2026-09-01', hasta: '2026-09-15' })).toEqual({
      where: 'order_delivered_at >= $1::date AND order_delivered_at < $2::date + 1',
      params: ['2026-09-01', '2026-09-15'],
    })
  })

  it('merchant y store sin fechas arrancan en $1', () => {
    expect(condicionesMixSegmentos({ clientId: '6576000', storeId: '187' })).toEqual({
      where: `client_id::text = $1 AND store_id::text = $2`,
      params: ['6576000', '187'],
    })
  })

  it('fechas + merchant + store combinados numeran en orden', () => {
    const r = condicionesMixSegmentos({ desde: '2026-01-01', hasta: '2026-12-31', clientId: '6519178', storeId: '42' })
    expect(r?.where).toContain('client_id::text = $3')
    expect(r?.where).toContain('store_id::text = $4')
    expect(r?.params).toEqual(['2026-01-01', '2026-12-31', '6519178', '42'])
  })

  it('rechaza filtros inválidos: sin filtros, fechas incoherentes o a medias, ids no numéricos y clients propios', () => {
    expect(condicionesMixSegmentos({})).toBeNull()
    expect(condicionesMixSegmentos({ desde: '2026-09-15', hasta: '2026-09-01' })).toBeNull()
    expect(condicionesMixSegmentos({ desde: '2026-09-01' })).toBeNull()
    expect(condicionesMixSegmentos({ desde: 'ayer', hasta: '2026-09-01' })).toBeNull()
    expect(condicionesMixSegmentos({ clientId: `1' OR '1'='1` })).toBeNull()
    expect(condicionesMixSegmentos({ storeId: 'abc' })).toBeNull()
    expect(condicionesMixSegmentos({ clientId: CLIENT_IDS_PROPIOS[0] })).toBeNull()
  })
})

describe('ordenarFilasMix', () => {
  it('ordena alfabéticamente con S/D al final y no muta la entrada', () => {
    const filas = [
      { segmento: 'S/D', propia: 1, terceros: 0, total: 1 },
      { segmento: 'B2', propia: 1, terceros: 0, total: 1 },
      { segmento: 'A4', propia: 1, terceros: 0, total: 1 },
    ]
    const ordenadas = ordenarFilasMix(filas)
    expect(ordenadas.map(f => f.segmento)).toEqual(['A4', 'B2', 'S/D'])
    expect(filas.map(f => f.segmento)).toEqual(['S/D', 'B2', 'A4'])
  })
})
