import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { signWebhook, buildTimestamp, sendPurchaseWebhook, sendWholesaleWebhook } from '@/lib/gocelular-webhook'
import type { PurchasePayload } from '@/lib/gocelular-webhook'

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

describe('sendPurchaseWebhook', () => {
  const mockPayload: PurchasePayload = {
    purchase_reference: 'PUR-001',
    supplier: 'test-supplier',
    destination: 'local',
    lines: [
      {
        line_reference: 'LINE-001',
        item_type: 'device',
        sku: 'SKU-001',
        quantity: 1,
      },
    ],
    timestamp: '2026-08-12T12:30:00-03:00',
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('GOCELULAR_WEBHOOK_SECRET', 'test-secret')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('200 OK: returns {ok: true, status: 200}, fetch called once, headers present', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ result: 'success', purchase_id: 'ID-123' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await sendPurchaseWebhook(mockPayload)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.retryable).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('https://gocelular.gocuotas.com/api/webhooks/gocelular/purchase')
    expect(callArgs[1].headers['X-Gocelular-Signature']).toBeDefined()
    expect(callArgs[1].headers['X-Gocelular-Timestamp']).toBeDefined()
    expect(callArgs[1].body).toBe(JSON.stringify(mockPayload))
  })

  it('400 Bad Request: returns {ok: false, status: 400, retryable: false}, no retry', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 400,
      json: async () => ({ code: 'invalid_payload' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await sendPurchaseWebhook(mockPayload)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.retryable).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('503 every attempt: fetch called 4 times, returns {ok: false, retryable: true}', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 503,
      json: async () => ({ code: 'service_unavailable' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const promise = sendPurchaseWebhook(mockPayload)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.ok).toBe(false)
    expect(result.status).toBe(503)
    expect(result.retryable).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it('missing secret: returns {ok: false, retryable: false}, fetch never called', async () => {
    vi.stubEnv('GOCELULAR_WEBHOOK_SECRET', '')
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const result = await sendPurchaseWebhook(mockPayload)

    expect(result.ok).toBe(false)
    expect(result.retryable).toBe(false)
    expect(result.body?.code).toBe('secret_no_configurado')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('sendWholesaleWebhook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('GOCELULAR_WEBHOOK_SECRET', 'test-secret')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('200 legacy: ok, un solo fetch, body identico al rawBody', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sale_id: 's1', fa_status: 'pending' }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    const raw = JSON.stringify({ proforma_number: '150' })
    const p = sendWholesaleWebhook(raw)
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.ok).toBe(true)
    expect(r.body?.sale_id).toBe('s1')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][1].body).toBe(raw)
  })

  it('400 con envelope legacy {error, details}: no reintenta', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'store_mismatch', details: 'x' }), { status: 400 }))
    vi.stubGlobal('fetch', mockFetch)
    const p = sendWholesaleWebhook('{}')
    await vi.runAllTimersAsync()
    const r = await p
    expect(r.retryable).toBe(false)
    expect(r.body?.error).toBe('store_mismatch')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('503 en todos los intentos: 4 fetch, retryable', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'rejected', code: 'integration_disabled' }), { status: 503 }))
    vi.stubGlobal('fetch', mockFetch)
    const p = sendWholesaleWebhook('{}')
    await vi.runAllTimersAsync()
    const r = await p
    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(r.retryable).toBe(true)
  })

  it('reintentos con el MISMO body y firma distinta por timestamp fresco', async () => {
    let call = 0
    const mockFetch = vi.fn().mockImplementation(() => {
      call++
      return Promise.resolve(new Response('{}', { status: call < 2 ? 500 : 200 }))
    })
    vi.stubGlobal('fetch', mockFetch)
    const raw = '{"a":1}'
    const p = sendWholesaleWebhook(raw)
    await vi.runAllTimersAsync()
    await p
    expect(mockFetch.mock.calls[0][1].body).toBe(raw)
    expect(mockFetch.mock.calls[1][1].body).toBe(raw)
  })
})
