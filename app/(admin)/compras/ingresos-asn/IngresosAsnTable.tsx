'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearControlAsn, avisarDiferenciasAsn, type AsnResumen } from '@/lib/actions/asn-control'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function IngresosAsnTable({ asns }: { asns: AsnResumen[] }) {
  const router = useRouter()
  const [copiado, setCopiado] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const copiarLink = async (token: string, asnId: string) => {
    const url = `${window.location.origin}/share/asn?token=${token}`
    await navigator.clipboard.writeText(url)
    setCopiado(asnId)
    setTimeout(() => setCopiado(c => (c === asnId ? null : c)), 2000)
  }

  const crearYCopiar = async (a: AsnResumen) => {
    setTrabajando(a.asnId); setError(null)
    const r = await crearControlAsn(a.asnId, a.transaccion)
    if (r.error) setError(r.error)
    else if (r.token) {
      await copiarLink(r.token, a.asnId)
      router.refresh()
    }
    setTrabajando(null)
  }

  if (asns.length === 0) {
    return <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">No hay ASNs en los últimos 60 días.</div>
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {error && <div className="px-4 py-2 text-sm text-red-600 border-b border-gray-100">{error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ASN</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Enviada</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">IMEIs</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase" title="Unidades sin IMEI (kits/accesorios)">Otros</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Control de ingreso</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-[220px]"></th>
            </tr>
          </thead>
          <tbody>
            {asns.map(a => {
              const r = a.resultado
              const conDif = r !== null && (r.faltantes.length > 0 || r.sobrantes.length > 0)
              return (
                <FilaAsn
                  key={a.asnId}
                  a={a}
                  conDif={conDif}
                  copiado={copiado === a.asnId}
                  trabajando={trabajando === a.asnId}
                  abierta={abierta === a.asnId}
                  onToggle={() => setAbierta(abierta === a.asnId ? null : a.asnId)}
                  onCrear={() => crearYCopiar(a)}
                  onCopiar={() => a.control && copiarLink(a.control.token, a.asnId)}
                  onAvisar={async () => {
                    if (!a.control) return
                    if (!confirm(`Avisar a GOcelular por Novedad las diferencias de la ASN ${a.transaccion}?`)) return
                    setTrabajando(a.asnId); setError(null)
                    const res = await avisarDiferenciasAsn(a.control.id)
                    if (res.error) setError(res.error)
                    router.refresh()
                    setTrabajando(null)
                  }}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilaAsn({ a, conDif, copiado, trabajando, abierta, onToggle, onCrear, onCopiar, onAvisar }: {
  a: AsnResumen
  conDif: boolean
  copiado: boolean
  trabajando: boolean
  abierta: boolean
  onToggle: () => void
  onCrear: () => void
  onCopiar: () => void
  onAvisar: () => void
}) {
  const r = a.resultado
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="px-4 py-3 font-medium text-gray-900">
          #{a.transaccion}
          <span className="block text-[10px] font-normal text-gray-400">{a.estadoAndreani}</span>
        </td>
        <td className="px-4 py-3 text-gray-600">{fecha(a.fecha)}</td>
        <td className="px-4 py-3 text-right text-gray-900 font-semibold">{a.imeis || '—'}</td>
        <td className="px-4 py-3 text-right text-gray-600">{a.addonsUnidades || '—'}</td>
        <td className="px-4 py-3">
          {!a.control && <span className="text-gray-300">sin control</span>}
          {a.control && a.control.estado === 'pendiente' && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">link generado — esperando escaneo</span>
          )}
          {a.control && a.control.estado === 'finalizado' && r && (
            conDif ? (
              <button onClick={onToggle} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 hover:bg-red-100">
                ⚠ {r.faltantes.length} faltantes · {r.sobrantes.length} sobrantes {abierta ? '▾' : '▸'}
              </button>
            ) : (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">✓ ingresó completa ({r.ok.length})</span>
            )
          )}
          {a.control?.novedad_enviada_at && (
            <span className="block text-[10px] text-gray-400 mt-0.5">novedad enviada el {fecha(a.control.novedad_enviada_at)}</span>
          )}
        </td>
        <td className="px-4 py-3 text-center whitespace-nowrap">
          {a.imeis === 0 && !a.control ? (
            <span className="text-[11px] text-gray-300" title="ASN sin IMEIs (solo kits/accesorios): el control por escaneo no aplica">solo bultos</span>
          ) : !a.control ? (
            <button onClick={onCrear} disabled={trabajando} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium disabled:opacity-50">
              {trabajando ? '…' : 'Crear link de control'}
            </button>
          ) : (
            <>
              <button onClick={onCopiar} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mr-3">
                {copiado ? '✓ Copiado' : 'Copiar link'}
              </button>
              {conDif && !a.control.novedad_enviada_at && (
                <button onClick={onAvisar} disabled={trabajando} className="text-red-600 hover:text-red-800 text-xs font-semibold disabled:opacity-50">
                  {trabajando ? '…' : 'Avisar a GOcelular'}
                </button>
              )}
            </>
          )}
        </td>
      </tr>
      {abierta && r && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={6} className="px-6 py-3 text-xs text-gray-700 space-y-2">
            {r.faltantes.length > 0 && (
              <div>
                <b className="text-red-700">Faltantes (no escaneados):</b>{' '}
                <span className="font-mono">{r.faltantes.join(', ')}</span>
              </div>
            )}
            {r.sobrantes.length > 0 && (
              <div>
                <b className="text-amber-700">Sobrantes (no pertenecen a la ASN):</b>{' '}
                <span className="font-mono">{r.sobrantes.join(', ')}</span>
              </div>
            )}
            {a.control?.nota && <div><b>Nota del operario:</b> {a.control.nota}</div>}
          </td>
        </tr>
      )}
    </>
  )
}
