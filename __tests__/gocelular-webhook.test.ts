import { describe, it, expect } from 'vitest'
import { signWebhook, buildTimestamp } from '@/lib/gocelular-webhook'

describe('signWebhook', () => {
  it('firma HMAC-SHA256 de timestamp + "." + rawBody en hex minuscula', () => {
    // Vector precomputado con: crypto.createHmac('sha256','test-secret')
    //   .update('2026-08-12T14:30:00-03:00.{"a":1}').digest('hex')
    const sig = signWebhook('test-secret', '2026-08-12T14:30:00-03:00', '{"a":1}')
    expect(sig).toBe('577f72d4873cb59626690c46f35923d70bddb17d645b3431d17566835051072d')
  })

  it('cambia si cambia el body', () => {
    const a = signWebhook('test-secret', '2026-08-12T14:30:00-03:00', '{"a":1}')
    const b = signWebhook('test-secret', '2026-08-12T14:30:00-03:00', '{"a":2}')
    expect(a).not.toBe(b)
  })
})

describe('buildTimestamp', () => {
  it('genera ISO-8601 con offset -03:00 explicito', () => {
    // 15:30 UTC == 12:30 en Argentina (UTC-3)
    const ts = buildTimestamp(new Date('2026-08-12T15:30:00.000Z'))
    expect(ts).toBe('2026-08-12T12:30:00-03:00')
  })
})
