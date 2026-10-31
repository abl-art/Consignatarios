import { describe, it, expect } from 'vitest'
import { interpretarRespuestaEnacom, extraerSesionEnacom } from '@/lib/enacom'

// Forma real de la respuesta Livewire de imei.enacom.gob.ar (capturada el
// 30/10/2026): el snapshot viaja como string JSON anidado y resultado es
// [objeto, {"s":"arr"}].
function respuesta(bloqueado: string, mensaje: string): string {
  const snapshot = JSON.stringify({
    data: {
      imei: '353870107952869',
      resultado: [{ bloqueado, status: 'Válido', mensaje, gsmaStatus: '' }, { s: 'arr' }],
      error: null,
      showResult: true,
    },
    memo: { id: 'abc123' },
  })
  return JSON.stringify({ components: [{ snapshot }] })
}

describe('interpretarRespuestaEnacom', () => {
  it('NO bloqueado → no_bloqueado con el mensaje oficial', () => {
    const r = interpretarRespuestaEnacom(respuesta('NO', 'El dispositivo no figura denunciado por robo, hurto o extravío'))
    expect(r).toEqual({ estado: 'no_bloqueado', mensaje: 'El dispositivo no figura denunciado por robo, hurto o extravío' })
  })

  it('SI/Si bloqueado → bloqueado (case-insensitive)', () => {
    expect(interpretarRespuestaEnacom(respuesta('SI', 'Bloqueado'))?.estado).toBe('bloqueado')
    expect(interpretarRespuestaEnacom(respuesta('Si', 'Bloqueado'))?.estado).toBe('bloqueado')
  })

  it('formas inesperadas → null (el caller degrada a sin_dato)', () => {
    expect(interpretarRespuestaEnacom('not json')).toBeNull()
    expect(interpretarRespuestaEnacom('{}')).toBeNull()
    expect(interpretarRespuestaEnacom(JSON.stringify({ components: [{ snapshot: '{"data":{}}' }] }))).toBeNull()
    expect(interpretarRespuestaEnacom(respuesta('QUIZAS', 'x'))).toBeNull()
  })
})

describe('extraerSesionEnacom', () => {
  it('saca csrf y snapshot (des-escapando las comillas HTML)', () => {
    const html =
      '<meta name="csrf-token" content="TOK123">' +
      '<div wire:snapshot="{&quot;data&quot;:{&quot;imei&quot;:&quot;&quot;}}"></div>'
    expect(extraerSesionEnacom(html)).toEqual({ csrf: 'TOK123', snapshot: '{"data":{"imei":""}}' })
  })

  it('HTML sin los atributos → null', () => {
    expect(extraerSesionEnacom('<html></html>')).toBeNull()
  })
})
