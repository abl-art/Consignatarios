import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect('https://gocelular360.vercel.app/notas?error=no_code')
  }

  const redirectUri = 'https://gocelular360.vercel.app/api/auth/google/callback'

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    return NextResponse.redirect('https://gocelular360.vercel.app/notas?error=token_failed')
  }

  // Guardar tokens en flujo_config
  const sb = createAdminClient()
  await sb.from('flujo_config').upsert({
    key: 'google_calendar_tokens',
    value: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: Date.now() + (tokens.expires_in * 1000),
    }),
    updated_at: new Date().toISOString(),
  })

  return NextResponse.redirect('https://gocelular360.vercel.app/notas?google=connected')
}
