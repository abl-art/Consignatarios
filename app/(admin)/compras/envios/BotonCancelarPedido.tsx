'use client'

// Botón "Cancelar pedido" (API de cancelaciones del warehouse, Pedro 27/10):
// 1er clic corre el PREVIEW y arma el botón mostrando qué va a pasar; 2do clic
// hace el APPLY y el botón queda "cancelando…" consultando el estado cada 10s
// (Andreani resuelve en ~1 min) hasta confirmar `cancelado`. La orden de
// GOcuotas sigue viva: el refund es el botón Anular orden, como siempre.
// Compartido entre la tabla de Arrepentimientos y el buscador transversal.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { previewCancelarPedido, aplicarCancelarPedido, confirmarCancelacionPedido } from '@/lib/actions/cancelaciones'
import { puedeCancelarPedido } from '@/lib/cancelaciones'

const INTENTOS_POLL = 9
const INTERVALO_MS = 10000

type Fase = 'idle' | 'previewing' | 'armado' | 'aplicando' | 'cancelando' | 'demorado'

export default function BotonCancelarPedido({
  arrepId,
  estado,
  orderNumber,
  fulfillment,
  compacto = false,
}: {
  arrepId: string
  estado: string
  orderNumber: string | null
  fulfillment: string | null
  compacto?: boolean
}) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('idle')
  const [detalle, setDetalle] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef(0)

  const guard = puedeCancelarPedido({ estado, orderNumber, fulfillment })

  async function sondear() {
    pollRef.current += 1
    const r = await confirmarCancelacionPedido(arrepId)
    if (r.confirmada) {
      setFase('idle')
      router.refresh()
      return
    }
    if (pollRef.current >= INTENTOS_POLL) {
      setFase('demorado')
      return
    }
    setTimeout(sondear, INTERVALO_MS)
  }

  async function clickear() {
    setError(null)
    if (fase === 'idle') {
      setFase('previewing')
      const r = await previewCancelarPedido(arrepId)
      if (r.error) {
        setError(r.error)
        setFase('idle')
        return
      }
      setDetalle(r.mensaje ?? '')
      setFase('armado')
      return
    }
    if (fase === 'armado') {
      setFase('aplicando')
      const r = await aplicarCancelarPedido(arrepId)
      if (r.error) {
        setError(r.error)
        setFase('idle')
        return
      }
      pollRef.current = 0
      setFase('cancelando')
      setTimeout(sondear, INTERVALO_MS)
      return
    }
    if (fase === 'demorado') {
      pollRef.current = 0
      setFase('cancelando')
      sondear()
    }
  }

  const etiqueta =
    fase === 'previewing' ? 'consultando…'
    : fase === 'armado' ? '¿Cancelar en Andreani?'
    : fase === 'aplicando' ? 'cancelando…'
    : fase === 'cancelando' ? '⏳ cancelando…'
    : fase === 'demorado' ? '⏳ sigue en proceso — volver a consultar'
    : 'Cancelar pedido'

  const titulo = !guard.ok
    ? guard.error
    : fase === 'armado' && detalle
      ? `Preview de GOcelular: ${detalle}`
      : 'Frena el pedido en el warehouse/Andreani — la orden de GOcuotas sigue viva (el refund es Anular orden)'

  return (
    <>
      <button
        onClick={clickear}
        disabled={!guard.ok || fase === 'previewing' || fase === 'aplicando' || fase === 'cancelando'}
        title={titulo}
        className={`${compacto ? 'text-xs font-medium rounded-lg px-2.5 py-1' : 'ml-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 border'} transition-colors ${
          fase === 'armado'
            ? compacto ? 'bg-amber-600 text-white' : 'bg-amber-600 text-white border-amber-600'
            : fase === 'cancelando' || fase === 'aplicando' || fase === 'demorado'
              ? compacto ? 'bg-amber-50 text-amber-700' : 'text-amber-700 bg-amber-50 border-amber-200'
              : compacto ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40' : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 disabled:opacity-40'
        }`}
      >
        {etiqueta}
      </button>
      {error && <span className={`${compacto ? 'text-xs' : 'text-[10px]'} text-red-600 ml-1`}>✗ {error}</span>}
    </>
  )
}
