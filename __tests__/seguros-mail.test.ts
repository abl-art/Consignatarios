import { describe, it, expect } from 'vitest'
import { armarMailCertificado, fechaCorta, LINK_DENUNCIA } from '@/lib/seguros-mail'

const DATOS = {
  numero: 123,
  articulo: 'Motorola Moto G17 4/256GB',
  imei: '350000000000001',
  inicioVig: '2026-11-03',
  finVig: '2027-08-03',
}

describe('fechaCorta', () => {
  it('convierte YYYY-MM-DD a DD/MM/YYYY sin pasar por Date', () => {
    expect(fechaCorta('2026-11-03')).toBe('03/11/2026')
    expect(fechaCorta('2026-11-03T12:00:00Z')).toBe('03/11/2026')
  })
})

describe('armarMailCertificado', () => {
  const mail = armarMailCertificado(DATOS)

  it('el asunto es buscable y lleva el número de certificado', () => {
    expect(mail.asunto).toContain('Tu seguro contra robo')
    expect(mail.asunto).toContain('N° 123')
  })

  it('html y texto llevan los 3 requisitos: cuotas, denuncia con IMEI y baja al *910', () => {
    for (const cuerpo of [mail.html, mail.texto]) {
      expect(cuerpo).toMatch(/cuotas al día/i)
      expect(cuerpo).toMatch(/denuncia policial/i)
      expect(cuerpo).toContain('*910')
      expect(cuerpo).toMatch(/número de gestión/i)
    }
  })

  it('llevan el certificado, el equipo, el IMEI, la vigencia y el link de denuncia', () => {
    for (const cuerpo of [mail.html, mail.texto]) {
      expect(cuerpo).toContain('123')
      expect(cuerpo).toContain(DATOS.articulo)
      expect(cuerpo).toContain(DATOS.imei)
      expect(cuerpo).toContain('03/11/2026')
      expect(cuerpo).toContain('03/08/2027')
      expect(cuerpo).toContain(LINK_DENUNCIA)
    }
  })

  it('instruye guardar el mail para no llamar a GOcelular por el número', () => {
    expect(mail.html).toMatch(/guardá este mail/i)
    expect(mail.texto).toMatch(/GUARDÁ ESTE MAIL/i)
  })
})
