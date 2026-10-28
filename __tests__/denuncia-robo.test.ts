import { test, expect, describe } from 'vitest'
import {
  validarArchivoDenuncia,
  sanitizarNombreArchivo,
  esCertificadoVigente,
  firmaDeArchivo,
  MAX_BYTES_DENUNCIA,
} from '@/lib/denuncia-robo'

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x00])
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const TEXTO_PLANO_BYTES = new Uint8Array([0x6e, 0x6f, 0x20, 0x65, 0x73, 0x20, 0x75, 0x6e]) // "no es un"

describe('firmaDeArchivo', () => {
  test('reconoce JPEG, PNG y PDF por magic bytes', () => {
    expect(firmaDeArchivo(JPEG_BYTES)).toBe('jpeg')
    expect(firmaDeArchivo(PNG_BYTES)).toBe('png')
    expect(firmaDeArchivo(PDF_BYTES)).toBe('pdf')
  })

  test('contenido sin firma conocida devuelve null', () => {
    expect(firmaDeArchivo(TEXTO_PLANO_BYTES)).toBeNull()
    expect(firmaDeArchivo(new Uint8Array([]))).toBeNull()
  })
})

describe('validarArchivoDenuncia', () => {
  test('acepta un JPEG real con extensión .jpg y content-type correcto', () => {
    const r = validarArchivoDenuncia('foto.jpg', 1000, 'image/jpeg', JPEG_BYTES)
    expect(r).toEqual({ ok: true, extension: 'jpg', mime: 'image/jpeg' })
  })

  test('acepta un PNG real con extensión .png y Content-Type genérico octet-stream', () => {
    const r = validarArchivoDenuncia('foto.PNG', 1000, 'application/octet-stream', PNG_BYTES)
    expect(r).toEqual({ ok: true, extension: 'png', mime: 'image/png' })
  })

  test('acepta un PDF real con extensión .pdf', () => {
    const r = validarArchivoDenuncia('denuncia.pdf', 1000, 'application/pdf', PDF_BYTES)
    expect(r).toEqual({ ok: true, extension: 'pdf', mime: 'application/pdf' })
  })

  test('rechaza archivo vacío', () => {
    expect(validarArchivoDenuncia('foto.jpg', 0, 'image/jpeg', JPEG_BYTES)).toEqual({
      ok: false,
      motivo: 'El archivo está vacío',
    })
  })

  test('rechaza archivo que supera los 10MB', () => {
    expect(validarArchivoDenuncia('foto.jpg', MAX_BYTES_DENUNCIA + 1, 'image/jpeg', JPEG_BYTES)).toEqual({
      ok: false,
      motivo: 'El archivo supera los 10MB',
    })
  })

  test('acepta justo en el límite de 10MB', () => {
    const r = validarArchivoDenuncia('foto.jpg', MAX_BYTES_DENUNCIA, 'image/jpeg', JPEG_BYTES)
    expect(r.ok).toBe(true)
  })

  test('rechaza extensión no permitida', () => {
    expect(validarArchivoDenuncia('archivo.txt', 1000, 'text/plain', TEXTO_PLANO_BYTES)).toEqual({
      ok: false,
      motivo: 'Formato no permitido (.jpg, .jpeg, .png, .pdf)',
    })
  })

  test('rechaza sin extensión', () => {
    expect(validarArchivoDenuncia('archivo', 1000, 'image/jpeg', JPEG_BYTES).ok).toBe(false)
  })

  test('rechaza Content-Type declarado que no matchea la extensión', () => {
    expect(validarArchivoDenuncia('foto.png', 1000, 'application/pdf', PNG_BYTES)).toEqual({
      ok: false,
      motivo: 'El tipo de archivo no coincide con la extensión',
    })
  })

  test('rechaza un .png cuyo contenido real no es un PNG (extensión + content-type mentidos)', () => {
    expect(validarArchivoDenuncia('foto.png', 1000, 'image/png', TEXTO_PLANO_BYTES)).toEqual({
      ok: false,
      motivo: 'El contenido del archivo no coincide con su extensión',
    })
  })

  test('rechaza un .pdf cuyo contenido real es un JPEG', () => {
    expect(validarArchivoDenuncia('foto.pdf', 1000, 'application/pdf', JPEG_BYTES)).toEqual({
      ok: false,
      motivo: 'El contenido del archivo no coincide con su extensión',
    })
  })
})

describe('sanitizarNombreArchivo', () => {
  test('conserva nombres simples ya seguros', () => {
    expect(sanitizarNombreArchivo('foto-denuncia_01.jpg')).toBe('foto-denuncia_01.jpg')
  })

  test('neutraliza path traversal con barras unix', () => {
    expect(sanitizarNombreArchivo('../../x.png')).toBe('x.png')
  })

  test('neutraliza path traversal mezclando barras unix y windows', () => {
    expect(sanitizarNombreArchivo('a/b\\c.pdf')).toBe('c.pdf')
  })

  test('neutraliza un path absoluto', () => {
    expect(sanitizarNombreArchivo('/etc/passwd')).toBe('passwd')
  })

  test('reemplaza caracteres unicode/espacios/símbolos fuera del allowlist', () => {
    const resultado = sanitizarNombreArchivo('café ☎ denuncia?.png')
    expect(resultado).toMatch(/^[a-zA-Z0-9._-]+$/)
    expect(resultado.endsWith('.png')).toBe(true)
  })

  test('nombre vacío cae al fallback "archivo"', () => {
    expect(sanitizarNombreArchivo('')).toBe('archivo')
  })

  test('trunca nombres muy largos a 120 caracteres, conservando el final (extensión)', () => {
    const largo = 'a'.repeat(200) + '.jpg'
    const resultado = sanitizarNombreArchivo(largo)
    expect(resultado.length).toBe(120)
    expect(resultado.endsWith('.jpg')).toBe(true)
  })
})

describe('esCertificadoVigente', () => {
  const base = { estado: 'emitido', fechaAnula: null, fechaSiniestro: null, finVig: '2026-12-31' }

  test('vigente: estado emitido, sin anulación, sin siniestro, fin_vig en el futuro', () => {
    expect(esCertificadoVigente(base, '2026-10-28')).toBe(true)
  })

  test('boundary: fin_vig == hoy sigue siendo vigente (inclusive)', () => {
    expect(esCertificadoVigente({ ...base, finVig: '2026-10-28' }, '2026-10-28')).toBe(true)
  })

  test('no vigente: fin_vig ya pasó', () => {
    expect(esCertificadoVigente({ ...base, finVig: '2026-10-27' }, '2026-10-28')).toBe(false)
  })

  test('no vigente: estado pendiente', () => {
    expect(esCertificadoVigente({ ...base, estado: 'pendiente' }, '2026-10-28')).toBe(false)
  })

  test('no vigente: tiene fecha_anula', () => {
    expect(esCertificadoVigente({ ...base, fechaAnula: '2026-09-01' }, '2026-10-28')).toBe(false)
  })

  test('no vigente: tiene fecha_siniestro', () => {
    expect(esCertificadoVigente({ ...base, fechaSiniestro: '2026-09-01' }, '2026-10-28')).toBe(false)
  })
})
