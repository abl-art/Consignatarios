import { describe, it, expect } from 'vitest'
import { parsearCSVDispositivos } from '@/app/(admin)/inventario/ImportarCSV'

describe('parsearCSVDispositivos', () => {
  it('parsea filas válidas correctamente', () => {
    const csv = `imei,marca,modelo
123456789012345,Samsung,Galaxy A54
987654321098765,Motorola,G84`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(2)
    expect(result.errores).toHaveLength(0)
    expect(result.validas[0]).toEqual({ imei: '123456789012345', marca: 'Samsung', modelo: 'Galaxy A54' })
  })

  it('detecta IMEI con formato inválido', () => {
    const csv = `imei,marca,modelo
12345ABCDE12345,Samsung,A54`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(0)
    expect(result.errores[0]).toMatchObject({ linea: 2, error: expect.stringContaining('IMEI') })
  })

  it('detecta filas con columnas faltantes', () => {
    const csv = `imei,marca,modelo
123456789012345,Samsung`
    const result = parsearCSVDispositivos(csv)
    expect(result.errores[0].error).toMatch(/columnas/)
  })

  it('ignora filas vacías', () => {
    const csv = `imei,marca,modelo
123456789012345,Samsung,A54

987654321098765,Motorola,G84`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(2)
  })
})
