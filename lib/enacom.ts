// Consulta del estado de un IMEI en la base pública de ENACOM
// (imei.enacom.gob.ar): dice si el equipo figura denunciado por robo/hurto/
// extravío — la fuente oficial que respalda el "número de gestión" de la baja
// que el cliente declara en el formulario de denuncia. OJO: no es una API
// documentada, es el formulario Livewire del sitio consultado
// programáticamente (verificado 30/10/2026, sin captcha). Si ENACOM cambia la
// página, la consulta degrada a 'sin_dato' — nunca rompe la pestaña (mismo
// patrón que la mora en vivo). La carga del bloqueo NO es instantánea: la
// operadora lo informa con una demora típica de 24-48 hs después del *910,
// por eso "aún no figura" en un caso recién denunciado es esperable.

export type EstadoImeiEnacom = 'bloqueado' | 'no_bloqueado' | 'sin_dato'

export type ConsultaEnacom = { estado: EstadoImeiEnacom; mensaje: string | null }

const BASE = 'https://imei.enacom.gob.ar'
const TIMEOUT_MS = 8000

/**
 * Interpreta el JSON que devuelve el endpoint Livewire de ENACOM. La
 * respuesta trae el snapshot del componente como STRING JSON anidado, con
 * `data.resultado` = [objeto, {"s":"arr"}] (marcador de array de Livewire).
 * El objeto tiene `bloqueado` ("SI"/"NO"), `status` ("Válido"/"Bloqueado") y
 * `mensaje` (el texto oficial). Cualquier forma inesperada → null (el caller
 * lo traduce a 'sin_dato').
 */
export function interpretarRespuestaEnacom(raw: string): ConsultaEnacom | null {
  try {
    const outer = JSON.parse(raw) as { components?: { snapshot?: string }[] }
    const snapshotStr = outer.components?.[0]?.snapshot
    if (!snapshotStr) return null
    const snapshot = JSON.parse(snapshotStr) as {
      data?: { resultado?: unknown; error?: unknown }
    }
    const resultado = snapshot.data?.resultado
    if (!Array.isArray(resultado) || resultado.length === 0) return null
    const info = resultado[0] as { bloqueado?: unknown; mensaje?: unknown }
    const bloqueadoRaw = typeof info.bloqueado === 'string' ? info.bloqueado.trim().toLowerCase() : null
    if (bloqueadoRaw !== 'si' && bloqueadoRaw !== 'sí' && bloqueadoRaw !== 'no') return null
    return {
      estado: bloqueadoRaw === 'no' ? 'no_bloqueado' : 'bloqueado',
      mensaje: typeof info.mensaje === 'string' && info.mensaje ? info.mensaje : null,
    }
  } catch {
    return null
  }
}

/** Extrae csrf-token y wire:snapshot del HTML de la página de consulta. */
export function extraerSesionEnacom(html: string): { csrf: string; snapshot: string } | null {
  const csrf = html.match(/name="csrf-token" content="([^"]+)"/)?.[1]
  const snapshotRaw = html.match(/wire:snapshot="([^"]+)"/)?.[1]
  if (!csrf || !snapshotRaw) return null
  return { csrf, snapshot: snapshotRaw.replace(/&quot;/g, '"').replace(/&amp;/g, '&') }
}

/**
 * Consulta el estado de un IMEI contra ENACOM, en vivo. Dos requests (página
 * para la sesión + update Livewire), timeout total acotado; CUALQUIER fallo
 * (red, cambio de página, respuesta rara) devuelve 'sin_dato' — este dato es
 * un refuerzo para el backoffice, nunca un bloqueante.
 */
export async function consultarImeiEnacom(imei: string): Promise<ConsultaEnacom> {
  const sinDato: ConsultaEnacom = { estado: 'sin_dato', mensaje: null }
  if (!/^\d{14,16}$/.test(imei)) return sinDato

  try {
    const r1 = await fetch(BASE + '/', { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!r1.ok) return sinDato
    const cookies = r1.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const sesion = extraerSesionEnacom(await r1.text())
    if (!sesion) return sinDato

    const r2 = await fetch(BASE + '/livewire/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookies, 'X-Livewire': '' },
      body: JSON.stringify({
        _token: sesion.csrf,
        components: [
          {
            snapshot: sesion.snapshot,
            updates: { imei },
            calls: [{ path: '', method: 'consultar', params: [] }],
          },
        ],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!r2.ok) return sinDato

    return interpretarRespuestaEnacom(await r2.text()) ?? sinDato
  } catch {
    return sinDato
  }
}
