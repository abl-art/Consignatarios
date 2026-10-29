'use client'

// Botón inteligente de la cola de Arrepentimientos para pedidos EXPEDIDOS
// (contrato de Pedro 29/10): 1er clic corre el preview genérico y el ruteo
// decide la acción real (rescate / devolución / caso manual) — Pedro manda
// sobre nuestro fulfillment cacheado; 2do clic dispara el apply. La rama
// devolución pide elegir modalidad (domicilio/sucursal). Si el apply sale,
// el arrepentimiento se cierra y el caso sigue en Rescates/Devoluciones.
// Los fulfillments cancelables siguen usando BotonCancelarPedido.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { previewAccionAndreani, aplicarRescateAndreani, aplicarDevolucionAndreani } from '@/lib/actions/cancelaciones'
import type { RuteoPreview } from '@/lib/acciones-arrepentimiento'
import type { ModalidadDevolucion } from '@/lib/cancelaciones'

type Fase = 'idle' | 'previewing' | 'armado' | 'aplicando' | 'listo'

export default function BotonAccionAndreani({ arrepId }: { arrepId: string }) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('idle')
  const [ruteo, setRuteo] = useState<RuteoPreview | null>(null)
  const [modalidad, setModalidad] = useState<ModalidadDevolucion>('domicilio')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function clickear() {
    setError(null)
    setAviso(null)
    if (fase === 'idle') {
      setFase('previewing')
      const r = await previewAccionAndreani(arrepId)
      if (r.error || !r.ruteo) {
        setError(r.error ?? 'Sin respuesta del preview.')
        setFase('idle')
        return
      }
      if (r.ruteo.tipo !== 'go') {
        setAviso(r.ruteo.motivo)
        setFase('idle')
        return
      }
      if (r.ruteo.accion === 'cancelar_pedido') {
        // Nuestro fulfillment estaba atrasado: el pedido sigue en el depósito.
        setAviso('Según GOcelular el pedido todavía está en el depósito — refrescá la página y usá «Cancelar pedido».')
        setFase('idle')
        return
      }
      setRuteo(r.ruteo)
      setFase('armado')
      return
    }
    if (fase === 'armado' && ruteo?.tipo === 'go') {
      setFase('aplicando')
      const r = ruteo.accion === 'solicitar_devolucion'
        ? await aplicarDevolucionAndreani(arrepId, modalidad)
        : await aplicarRescateAndreani(arrepId)
      if (r.error) {
        setError(r.error)
        setFase('idle')
        return
      }
      setFase('listo')
      router.refresh()
    }
  }

  const esDevolucion = ruteo?.tipo === 'go' && ruteo.accion === 'solicitar_devolucion'
  const etiqueta =
    fase === 'previewing' ? 'consultando…'
    : fase === 'armado' ? `¿${ruteo?.tipo === 'go' ? ruteo.label : 'Confirmar'}${esDevolucion ? ` (${modalidad})` : ''}?`
    : fase === 'aplicando' ? 'pidiendo…'
    : fase === 'listo' ? '✓ pedido'
    : 'Acción Andreani'

  return (
    <span className="inline-flex items-center gap-1">
      {esDevolucion && fase === 'armado' && (
        <select
          value={modalidad}
          onChange={e => setModalidad(e.target.value as ModalidadDevolucion)}
          className="text-[10px] border border-gray-200 rounded px-1 py-0.5"
          title="domicilio: Andreani pasa a buscar el paquete · sucursal: el cliente lo lleva a una sucursal"
        >
          <option value="domicilio">domicilio</option>
          <option value="sucursal">sucursal</option>
        </select>
      )}
      <button
        onClick={clickear}
        disabled={fase === 'previewing' || fase === 'aplicando' || fase === 'listo'}
        title={
          fase === 'armado' && ruteo?.tipo === 'go'
            ? ruteo.accion === 'solicitar_devolucion'
              ? 'Pide el envío inverso a Andreani por el webhook de GOcelular (el reembolso lo decide un operador al recibir el equipo)'
              : 'Pide el rescate del envío a Andreani por el webhook de GOcelular'
            : 'Consulta a GOcelular qué acción corresponde (cancelar / rescate / devolución) según el estado real del pedido'
        }
        className={`ml-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 border transition-colors ${
          fase === 'armado'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : fase === 'listo'
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 disabled:opacity-40'
        }`}
      >
        {etiqueta}
      </button>
      {aviso && <span className="text-[10px] text-amber-700 max-w-[220px]">{aviso}</span>}
      {error && <span className="text-[10px] text-red-600 max-w-[220px]">✗ {error}</span>}
    </span>
  )
}
