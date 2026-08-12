import { createAdminClient } from '@/lib/supabase/admin'

// Access token de la conexion Google del admin (guardada en flujo_config por
// /api/auth/google/callback). Se refresca solo cuando expira.
// La misma conexion sirve para Calendar y Gmail (scope gmail.send).
export async function getGoogleAccessToken(): Promise<string | null> {
  const sb = createAdminClient()
  const { data } = await sb.from('flujo_config').select('value').eq('key', 'google_calendar_tokens').single()
  if (!data?.value) return null

  const tokens = JSON.parse(data.value)

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
