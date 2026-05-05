'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarEntregaKits } from '@/lib/actions/proveedor-kits'

interface Producto {
  id: string
  nombre: string
  codigo: string
}

export default function EntregaForm({ token, productos }: { token: string; productos: Producto[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(false)

  const itemsConCantidad = productos.filter(p => (cantidades[p.id] ?? 0) > 0)
  const totalKits = Object.values(cantidades).reduce((s, q) => s + (q > 0 ? q : 0), 0)

  async function handleSubmit() {
    if (totalKits === 0) return
    if (!confirm(`¿Confirmar entrega de ${totalKits} kits?`)) return

    setEnviando(true)
    const result = await registrarEntregaKits(
      token,
      itemsConCantidad.map(p => ({
        productoId: p.id,
        productoNombre: p.nombre,
        productoCodigo: p.codigo,
        cantidad: cantidades[p.id],
      }))
    )
    setEnviando(false)

    if (result.ok) {
      setExito(true)
      setCantidades({})
      setTimeout(() => {
        setExito(false)
        setOpen(false)
        router.refresh()
      }, 2000)
    } else {
      alert(result.error ?? 'Error al registrar')
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
      >
        Registrar entrega de kits
      </button>
    )
  }

  return (
    <div className="bg-white border border-green-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-green-50 border-b border-green-200 flex items-center justify-between">
        <h3 className="font-semibold text-green-900">Registrar entrega</h3>
        <button onClick={() => { setOpen(false); setCantidades({}) }} className="text-xs text-gray-500 hover:text-gray-700">
          Cancelar
        </button>
      </div>

      {exito ? (
        <div className="p-8 text-center">
          <svg className="w-10 h-10 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-green-700 font-semibold">Entrega registrada</p>
        </div>
      ) : (
        <>
          <div className="p-4">
            <p className="text-xs text-gray-500 mb-3">Ingresá la cantidad de kits entregados por modelo:</p>
            <div className="space-y-2">
              {productos.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    value={cantidades[p.id] ?? ''}
                    onChange={e => setCantidades(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono"
                  />
                  <span className="text-sm text-gray-700">{p.nombre}</span>
                </div>
              ))}
            </div>
          </div>

          {totalKits > 0 && (
            <div className="px-4 pb-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex justify-between items-center">
                <span className="text-sm text-green-800">Total: <strong>{totalKits} kits</strong></span>
                <span className="text-sm text-green-800 font-semibold">
                  ${(totalKits * 7000).toLocaleString('es-AR')}
                </span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={enviando}
                className="w-full py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {enviando ? 'Registrando...' : 'Confirmar entrega'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
