'use client'

import { useState } from 'react'

interface TransitoModelo {
  modelo: string
  cantidad: number
  proveedores: string[]
}

export default function TransitoModelos({ modelos, enTransito }: { modelos: TransitoModelo[]; enTransito: number }) {
  const [open, setOpen] = useState(false)

  if (modelos.length === 0) return null

  const totalUnidades = modelos.reduce((s, m) => s + m.cantidad, 0)

  return (
    <div className="mt-8 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">En tránsito por modelo</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {totalUnidades} unidades en {enTransito} pedidos
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <table className="w-full text-sm border-t border-gray-200">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-2 font-medium text-gray-600">Modelo</th>
              <th className="text-center px-4 py-2 font-medium text-gray-600">Cantidad</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Proveedor</th>
            </tr>
          </thead>
          <tbody>
            {modelos.map((m) => (
              <tr key={m.modelo} className="border-b border-gray-100">
                <td className="px-5 py-2.5 font-medium text-gray-900">{m.modelo}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                    {m.cantidad}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{m.proveedores.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
