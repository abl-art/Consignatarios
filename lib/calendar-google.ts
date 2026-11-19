// ─── Google Calendar compartido ────────────────────────────────────────────
// Lógica movida de app/api/calendar/route.ts para que el informe diario pueda
// leer los eventos del día server-side sin pasar por HTTP. Los tokens OAuth
// viven en flujo_config (key google_calendar_tokens) y se refrescan solos.

import { createAdminClient } from '@/lib/supabase/admin'

export async function getAccessToken(): Promise<string | null> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'google_calendar_tokens').single()
  if (!data?.value) return null

  const tokens = JSON.parse(data.value)

  // Si el token expiró, refrescar
  if (Date.now() > tokens.expiry_date - 60000 && tokens.refresh_token) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
    const newTokens = await res.json()
    if (newTokens.access_token) {
      tokens.access_token = newTokens.access_token
      tokens.expiry_date = Date.now() + (newTokens.expires_in * 1000)
      await sb.from('flujo_config').upsert({
        key: 'google_calendar_tokens',
        value: JSON.stringify(tokens),
        updated_at: new Date().toISOString(),
      })
    }
  }

  return tokens.access_token
}

export interface EventoCalendario {
  id: string
  titulo: string
  horaInicio: string
  horaFin: string
  asistentes: string[]
}

/**
 * Eventos del día (hora ART). null = calendario no conectado (sin tokens);
 * error de la API de Google → throw con el detalle.
 */
export async function eventosDelDia(fecha: string): Promise<EventoCalendario[] | null> {
  const accessToken = await getAccessToken()
  if (!accessToken) return null

  const timeMin = `${fecha}T00:00:00-03:00`
  const timeMax = `${fecha}T23:59:59-03:00`

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    throw new Error(`calendar_error: ${await res.text()}`)
  }

  const data = await res.json()
  return (data.items || []).map((e: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; attendees?: { email: string }[] }) => ({
    id: e.id,
    titulo: e.summary || '(Sin título)',
    horaInicio: e.start?.dateTime || e.start?.date || '',
    horaFin: e.end?.dateTime || e.end?.date || '',
    asistentes: (e.attendees || []).map((a: { email: string }) => a.email),
  }))
}
