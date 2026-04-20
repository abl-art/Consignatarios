'use client'

import { useState } from 'react'

interface ModeloTransito {
  modelo: string
  total: number
  proveedores: Record<string, number>
}

export default function TransitoTable({ summary, totalUnidades }: { summary: ModeloTransito[]; totalUnidades: number }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-5 py-3 font-medium text-gray-600">Modelo</th>
            <th className="text-center px-5 py-3 font-medium text-gray-600">Cantidad</th>
            <th className="text-left px-5 py-3 font-medium text-gray-600">Proveedor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {summary.map(m => {
            const provEntries = Object.entries(m.proveedores)
            const hasMultiple = provEntries.length > 1
            const isExpanded = expanded === m.modelo

            return hasMultiple ? (
              <tr key={m.modelo} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{m.modelo}</td>
                <td className="px-5 py-3 text-center font-bold text-blue-700">{m.total}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : m.modelo)}
                    className="text-gray-600 hover:text-blue-700 transition-colors text-left"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs">{isExpanded ? '▾' : '▸'}</span>
                      <span>{provEntries.length} proveedores</span>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 space-y-1 pl-4 border-l-2 border-blue-200">
                        {provEntries.sort((a, b) => b[1] - a[1]).map(([prov, cant]) => (
                          <div key={prov} className="flex justify-between gap-4 text-xs">
                            <span className="text-gray-700">{prov}</span>
                            <span className="font-bold text-blue-700">{cant} u.</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={m.modelo} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{m.modelo}</td>
                <td className="px-5 py-3 text-center font-bold text-blue-700">{m.total}</td>
                <td className="px-5 py-3 text-gray-600">{provEntries[0]?.[0]}</td>
              </tr>
            )
          })}
          <tr className="bg-blue-50">
            <td className="px-5 py-3 font-bold text-gray-900">Total</td>
            <td className="px-5 py-3 text-center font-bold text-blue-800">{totalUnidades}</td>
            <td className="px-5 py-3"></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
