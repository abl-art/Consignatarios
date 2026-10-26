// Cliente server-only de la API Redirect V1 de GOcuotas (la del checkout de
// la tienda): autenticación por email/password del comercio y reembolso TOTAL
// de órdenes. Docs: gocuotas-api.stoplight.io (API Redirect V1).
// Credenciales en env: GOCUOTAS_API_EMAIL / GOCUOTAS_API_PASSWORD, base
// opcional GOCUOTAS_API_BASE (default producción; sandbox.gocuotas.com para pruebas).

const BASE = () => (process.env.GOCUOTAS_API_BASE || 'https://www.gocuotas.com').replace(/\/$/, '')

export interface OrdenGocuotasApi {
  id: number
  amount_in_cents: number
  status: string
  delivered_at: string | null
  discarded_at: string | null
}

async function getToken(): Promise<string> {
  const email = process.env.GOCUOTAS_API_EMAIL
  const password = process.env.GOCUOTAS_API_PASSWORD
  if (!email || !password) {
    throw new Error('Credenciales de la API GOcuotas no configuradas (GOCUOTAS_API_EMAIL / GOCUOTAS_API_PASSWORD)')
  }
  const url = `${BASE()}/api_redirect/v1/authentication?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`
  const res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Autenticación GOcuotas falló (${res.status})`)
  const json = await res.json()
  if (!json?.token) throw new Error('Autenticación GOcuotas sin token en la respuesta')
  return json.token as string
}

/**
 * Reembolso TOTAL de una orden (sin amount_in_cents). La API no permite
 * reembolsar dos veces: un segundo intento devuelve error, no duplica plata.
 */
export async function reembolsarOrdenGocuotas(orderId: string | number): Promise<{ ok: true; detalle: string } | { ok: false; error: string }> {
  try {
    const token = await getToken()
    const res = await fetch(`${BASE()}/api_redirect/v1/orders/${orderId}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    const cuerpo = await res.text()
    if (!res.ok) return { ok: false, error: `Refund rechazado (${res.status}): ${cuerpo.slice(0, 300)}` }
    return { ok: true, detalle: cuerpo.slice(0, 500) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error inesperado' }
  }
}

/** Estado actual de una orden, para verificar el refund recién hecho. */
export async function getOrdenGocuotas(orderId: string | number): Promise<OrdenGocuotasApi | null> {
  try {
    const token = await getToken()
    const res = await fetch(`${BASE()}/api_redirect/v1/orders/${orderId}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as OrdenGocuotasApi
  } catch {
    return null
  }
}
