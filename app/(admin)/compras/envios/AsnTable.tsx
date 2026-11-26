'use client'

import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import type { AsnResumen } from '@/lib/gocelular'
import { avisarDiferenciasAsn, type ControlConResultado } from '@/lib/actions/asn-control'

const ESTADOS: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'Aceptado', cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rechazado', cls: 'bg-red-50 text-red-700 border-red-200' },
  sending: { label: 'Enviando', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}

export default function AsnTable({ asns, controles = {}, shareToken = '' }: {
  asns: AsnResumen[]
  /** Controles de ingreso finalizados por asn_id (escaneo del deposito via link unico) */
  controles?: Record<string, ControlConResultado>
  shareToken?: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [avisando, setAvisando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (asns.length === 0) {
    return <p className="text-sm text-gray-500">No hay ASN registrados.</p>
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      {shareToken && (
        <div className="px-6 py-2.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-gray-500">
            Control de ingreso en depósito: link único para Andreani (lista las ASN con celulares pendientes de escaneo)
          </span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/share/asn?token=${shareToken}`)
              setCopiado(true)
              setTimeout(() => setCopiado(false), 2000)
            }}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            {copiado ? '✓ Copiado' : 'Copiar link de control'}
          </button>
        </div>
      )}
      {error && <div className="px-6 py-2 text-sm text-red-600 border-b border-gray-100">{error}</div>}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-6 py-3 font-medium text-gray-600">ID transacción</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Orden</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
            <th className="text-right px-6 py-3 font-medium text-gray-600">Ingreso</th>
            <th className="text-left px-6 py-3 font-medium text-gray-600" title="Escaneo fisico en el deposito via link unico">Control depósito</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {asns.map((asn) => {
            const estado = ESTADOS[asn.estado] ?? { label: asn.estado, cls: 'bg-gray-50 text-gray-600 border-gray-200' }
            const completo = asn.totalUnidades > 0 && asn.pendientes === 0
            const expandido = abierto === asn.id
            const control = controles[asn.id]
            const dif = control ? control.resultado.faltantes.length + control.resultado.sobrantes.length : 0
            return (
              <Fragment key={asn.id}>
                <tr
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setAbierto(expandido ? null : asn.id)}
                >
                  <td className="px-6 py-3 font-medium text-gray-900 tabular-nums">{asn.id_transaccion}</td>
                  <td className="px-6 py-3 text-gray-600 max-w-[220px] truncate" title={asn.orden}>{asn.orden}</td>
                  <td className="px-6 py-3 text-gray-600">{new Date(asn.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${estado.cls}`}>
                      {estado.label}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {asn.totalUnidades === 0 ? (
                      <span className="text-gray-400">sin items</span>
                    ) : (
                      <span className={completo ? 'text-green-700 font-medium' : 'text-red-600 font-semibold'}>
                        {asn.ingresadas.toLocaleString('es-AR')}/{asn.totalUnidades.toLocaleString('es-AR')}
                        {!completo && ` — ${asn.pendientes.toLocaleString('es-AR')} pendientes`}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {!control ? (
                      <span className="text-gray-300 text-xs">sin control</span>
                    ) : dif === 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium bg-green-50 text-green-700 border-green-200" title={control.finalizado_at ? `Escaneada completa el ${new Date(control.finalizado_at).toLocaleDateString('es-AR')}` : undefined}>
                        ✓ Leída completa
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-semibold bg-red-50 text-red-700 border-red-200">
                        ⚠ {control.resultado.faltantes.length} falt. · {control.resultado.sobrantes.length} sobr.
                      </span>
                    )}
                    {control?.novedad_enviada_at && (
                      <span className="block text-[10px] text-gray-400 mt-0.5">novedad enviada {new Date(control.novedad_enviada_at).toLocaleDateString('es-AR')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{expandido ? '▲' : '▼'}</td>
                </tr>
                {expandido && control && dif > 0 && (
                  <tr className="bg-red-50/50">
                    <td colSpan={7} className="px-6 py-3 text-xs text-gray-700 space-y-1.5">
                      {control.resultado.faltantes.length > 0 && (
                        <div><b className="text-red-700">Faltantes (no escaneados en depósito):</b> <span className="font-mono">{control.resultado.faltantes.join(', ')}</span></div>
                      )}
                      {control.resultado.sobrantes.length > 0 && (
                        <div><b className="text-amber-700">Sobrantes (no pertenecen a la ASN):</b> <span className="font-mono">{control.resultado.sobrantes.join(', ')}</span></div>
                      )}
                      {control.nota && <div><b>Nota del operario:</b> {control.nota}</div>}
                      {!control.novedad_enviada_at && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Avisar a GOcelular por Novedad las diferencias de la ASN ${asn.id_transaccion}?`)) return
                            setAvisando(control.id); setError(null)
                            const r = await avisarDiferenciasAsn(control.id)
                            if (r.error) setError(r.error)
                            router.refresh()
                            setAvisando(null)
                          }}
                          disabled={avisando === control.id}
                          className="mt-1 text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                        >
                          {avisando === control.id ? 'Enviando…' : '→ Avisar a GOcelular por Novedad'}
                        </button>
                      )}
                    </td>
                  </tr>
                )}
                {expandido && (
                  <tr className="bg-gray-50">
                    <td colSpan={7} className="px-6 py-3">
                      {asn.items.length === 0 ? (
                        <p className="text-xs text-gray-500">Sin items vinculados a este ASN.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left py-1 font-medium">Item</th>
                              <th className="text-left py-1 font-medium">Tipo</th>
                              <th className="text-right py-1 font-medium">Cantidad</th>
                              <th className="text-right py-1 font-medium">Ingresadas</th>
                              <th className="text-right py-1 font-medium">Pendientes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {asn.items.map((item, i) => (
                              <tr key={i} className="border-t border-gray-200">
                                <td className="py-1.5 text-gray-900">{item.descripcion}</td>
                                <td className="py-1.5 text-gray-500">{item.tipo}</td>
                                <td className="py-1.5 text-right tabular-nums">{item.cantidad.toLocaleString('es-AR')}</td>
                                <td className="py-1.5 text-right tabular-nums text-green-700">{item.ingresadas.toLocaleString('es-AR')}</td>
                                <td className={`py-1.5 text-right tabular-nums ${item.cantidad - item.ingresadas > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                  {(item.cantidad - item.ingresadas).toLocaleString('es-AR')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
