import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getAccessToken(): Promise<string | null> {
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

// GET: eventos del día
export async function GET(request: Request) {
  const url = new URL(request.url)
  const fecha = url.searchParams.get('fecha') || new Date().toISOString().slice(0, 10)

  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const timeMin = `${fecha}T00:00:00-03:00`
  const timeMax = `${fecha}T23:59:59-03:00`

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'calendar_error', detail: await res.text() }, { status: res.status })
  }

  const data = await res.json()
  const events = (data.items || []).map((e: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; attendees?: { email: string }[] }) => ({
    id: e.id,
    titulo: e.summary || '(Sin título)',
    horaInicio: e.start?.dateTime || e.start?.date || '',
    horaFin: e.end?.dateTime || e.end?.date || '',
    asistentes: (e.attendees || []).map((a: { email: string }) => a.email),
  }))

  return NextResponse.json({ events })
}

// POST: crear evento
export async function POST(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const body = await request.json()
  const { titulo, fecha, horaInicio, horaFin, email, notas } = body

  const event = {
    summary: titulo,
    description: notas || '',
    start: { dateTime: `${fecha}T${horaInicio}:00-03:00`, timeZone: 'America/Argentina/Buenos_Aires' },
    end: { dateTime: `${fecha}T${horaFin}:00-03:00`, timeZone: 'America/Argentina/Buenos_Aires' },
    attendees: email ? [{ email }] : [],
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'create_failed', detail: await res.text() }, { status: res.status })
  }

  const created = await res.json()
  return NextResponse.json({ ok: true, id: created.id })
}

// PATCH: modificar evento existente
export async function PATCH(request: Request) {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const body = await request.json()
  const { eventId, horaInicio, horaFin, fecha, email } = body

  const patch: Record<string, unknown> = {}
  if (horaInicio && fecha) {
    patch.start = { dateTime: `${fecha}T${horaInicio}:00-03:00`, timeZone: 'America/Argentina/Buenos_Aires' }
  }
  if (horaFin && fecha) {
    patch.end = { dateTime: `${fecha}T${horaFin}:00-03:00`, timeZone: 'America/Argentina/Buenos_Aires' }
  }
  if (email !== undefined) {
    // Agregar invitado (no reemplazar los existentes)
    const getRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (getRes.ok) {
      const existing = await getRes.json()
      const attendees = existing.attendees || []
      if (email && !attendees.some((a: { email: string }) => a.email === email)) {
        attendees.push({ email })
      }
      patch.attendees = attendees
    }
  }

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'update_failed', detail: await res.text() }, { status: res.status })
  }

  return NextResponse.json({ ok: true })
}
