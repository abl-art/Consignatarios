'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cargarDevolucionManual } from '@/lib/actions/devoluciones'

// Carga a mano de una devolución generada por fuera de GOcelular (lado
// GOcuotas/Pedro): con el pedido y el tracking alcanza — el resto de los datos
// de la fila se cruza solo (cliente, producto, IMEI, envío de ida, estado).
export default function BotonCargarDevolucion() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [pedido, setPedido] = useState('')
  const [tracking, setTracking] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, startTransition] = useTransition()

  const cerrar = () => {
    setAbierto(false)
    setPedido('')
    setTracking('')
    setError(null)
  }

  const cargar = () => {
    setError(null)
    startTransition(async () => {
      const res = await cargarDevolucionManual(pedido, tracking)
      if (res.error) {
        setError(res.error)
      } else {
        cerrar()
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 whitespace-nowrap"
        title="Registrar una devolución generada por fuera de GOcelular (lado GOcuotas)"
      >
        + Cargar devolución
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrar}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-bold text-gray-900">Cargar devolución externa</h3>
              <p className="text-xs text-gray-500 mt-1">
                Para devoluciones generadas por fuera de GOcelular (p. ej. desde GOcuotas). Con el pedido y el
                tracking alcanza: el cliente, el producto, el IMEI y los seguimientos se cruzan solos.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Pedido GOcelular</span>
                <input
                  type="text"
                  value={pedido}
                  onChange={(e) => setPedido(e.target.value)}
                  placeholder="SO-58V423 o nro de orden GOcuotas (20819900)"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Tracking de la devolución (Andreani)</span>
                <input
                  type="text"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="360003148232650"
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !enviando) cargar() }}
                />
              </label>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={cerrar}
                disabled={enviando}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={cargar}
                disabled={enviando || !pedido.trim() || !tracking.trim()}
                className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40"
              >
                {enviando ? 'Verificando…' : 'Cargar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
