import { describe, it, expect } from 'vitest'
import { parsearCSVDispositivos } from '@/app/(admin)/inventario/ImportarCSV'

describe('parsearCSVDispositivos', () => {
  it('parsea filas válidas correctamente', () => {
    const csv = `imei,marca,modelo,precio_costo
123456789012345,Samsung,Galaxy A54,180000
987654321098765,Motorola,G84,150000`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(2)
    expect(result.errores).toHaveLength(0)
    expect(result.validas[0]).toEqual({
      imei: '123456789012345',
      marca: 'Samsung',
      modelo: 'Galaxy A54',
      precio_costo: 180000,
    })
  })

  it('detecta IMEI con formato inválido', () => {
    const csv = `imei,marca,modelo,precio_costo
12345ABCDE12345,Samsung,A54,180000`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(0)
    expect(result.errores[0]).toMatchObject({ linea: 2, error: expect.stringContaining('IMEI') })
  })

  it('detecta filas con columnas faltantes', () => {
    const csv = `imei,marca,modelo,precio_costo
123456789012345,Samsung,A54`
    const result = parsearCSVDispositivos(csv)
    expect(result.errores[0].error).toMatch(/columnas/)
  })

  it('detecta precio inválido', () => {
    const csv = `imei,marca,modelo,precio_costo
123456789012345,Samsung,A54,abc`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(0)
    expect(result.errores[0].error).toMatch(/[Pp]recio/)
  })

  it('ignora filas vacías', () => {
    const csv = `imei,marca,modelo,precio_costo
123456789012345,Samsung,A54,180000

987654321098765,Motorola,G84,150000`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(2)
  })
})
