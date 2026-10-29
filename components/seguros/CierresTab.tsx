'use client'

// Pestaña Cierres: histórico de cierres mensuales congelados (seguros_cierres)
// con descarga del Excel del broker tal como quedó al congelar, y botón para
// congelar manualmente el mes anterior si el cron del día 1 no corrió todavía.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { congelarCierre, type CierreRow } from '@/lib/actions/seguros'
import { formatearMoneda } from '@/lib/utils'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES[parseInt(m, 10) - 1]} ${y}`
}

/** 'YYYY-MM' del mes calendario anterior al actual (UTC, igual que congelarCierre). */
function mesAnteriorUTC(): string {
  const hoy = new Date()
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

interface Props {
  cierres: CierreRow[]
  operar: boolean
}

export default function CierresTab({ cierres, operar }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mesACongelar = mesAnteriorUTC()
  const yaCongelado = cierres.some((c) => c.mes === mesACongelar)

  function congelar() {
    setError(null)
    if (!confirmando) {
      setConfirmando(true)
      return
    }
    setConfirmando(false)
    startTransition(async () => {
      try {
        const resultado = await congelarCierre({ mes: mesACongelar })
        if (!resultado.ok) setError(`No se congeló: ${resultado.motivo ?? 'motivo desconocido'}.`)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado')
      }
    })
  }

  return (
    <div className="space-y-6">
      {operar && !yaCongelado && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Congelar cierre</h3>
          <p className="text-xs text-gray-500 mb-3">
            El cierre de {mesLabel(mesACongelar)} se congela solo el día 1 — este botón es el respaldo manual.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={congelar}
              className={`px-4 py-2 text-xs font-semibold rounded-lg disabled:opacity-50 ${
                confirmando
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-gray-900 text-white hover:bg-gray-700'
              }`}
            >
              {pending ? 'Congelando…' : confirmando ? `¿Confirmás congelar ${mesLabel(mesACongelar)}?` : `Congelar ${mesLabel(mesACongelar)}`}
            </button>
            {confirmando && !pending && (
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancelar
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Mes</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Congelado el</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Certificados</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Vigentes</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Anulados</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Siniestrados</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Suma vigente</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Prima</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Ingreso</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Resultado</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Excel</th>
            </tr>
          </thead>
          <tbody>
            {cierres.map((c) => (
              <tr key={c.mes} className="border-b border-gray-50">
                <td className="px-3 py-2 text-xs font-medium text-gray-900">{mesLabel(c.mes)}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{c.congeladoAt.slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-600">{c.resumen.certificados}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-600">{c.resumen.vigentes}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-600">{c.resumen.anulados}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-600">{c.resumen.siniestrados}</td>
                <td className="px-3 py-2 text-xs text-right font-mono text-gray-900">{formatearMoneda(c.resumen.sumaVigente)}</td>
                <td className="px-3 py-2 text-xs text-right font-mono text-gray-900">{formatearMoneda(c.resumen.prima)}</td>
                <td className="px-3 py-2 text-xs text-right font-mono text-gray-900">{formatearMoneda(c.resumen.ingreso)}</td>
                <td className={`px-3 py-2 text-xs text-right font-mono ${c.resumen.resultado < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatearMoneda(c.resumen.resultado)}
                </td>
                <td className="px-3 py-2 text-right">
                  <a
                    href={`/api/seguros/export?cierre=${c.mes}`}
                    className="inline-block px-2 py-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded hover:bg-violet-100"
                    title={`Descargar el Excel del broker congelado de ${mesLabel(c.mes)}`}
                  >
                    ⬇ Excel
                  </a>
                </td>
              </tr>
            ))}
            {cierres.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-sm text-gray-400">
                  Todavía no hay cierres — el primer cierre se congela solo el día 1 del mes que viene, o manualmente acá.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
