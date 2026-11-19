import { NextResponse } from 'next/server'
import { getAccessToken, eventosDelDia } from '@/lib/calendar-google'

// GET: eventos del día
export async function GET(request: Request) {
  const url = new URL(request.url)
  const fecha = url.searchParams.get('fecha') || new Date().toISOString().slice(0, 10)

  try {
    const events = await eventosDelDia(fecha)
    if (events === null) {
      return NextResponse.json({ error: 'not_connected' }, { status: 401 })
    }
    return NextResponse.json({ events })
  } catch (e) {
    const detail = e instanceof Error ? e.message.replace(/^calendar_error: /, '') : String(e)
    return NextResponse.json({ error: 'calendar_error', detail }, { status: 502 })
  }
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
