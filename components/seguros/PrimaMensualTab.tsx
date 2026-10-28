'use client'

// Pestaña Prima Mensual: tabla de devengoMensual (mes, certificados, suma
// vigente, prima) + editor del % de prima con fecha de vigencia (setParametro
// 'prima'). El editor solo se muestra si el usuario puede operar.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setParametro } from '@/lib/actions/seguros'
import { formatearMoneda } from '@/lib/utils'
import type { MesDevengo, ParametroPct } from '@/lib/seguros-informes'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES[parseInt(m, 10) - 1]} ${y}`
}

interface Props {
  devengo: MesDevengo[]
  primas: ParametroPct[]
  operar: boolean
}

export default function PrimaMensualTab({ devengo, primas, operar }: Props) {
  const router = useRouter()
  const [pct, setPct] = useState('')
  const [vigenteDesde, setVigenteDesde] = useState(() => new Date().toISOString().slice(0, 10))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const tramosOrdenados = [...primas].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
  const totalSuma = devengo.reduce((s, m) => s + m.sumaVigente, 0)
  const totalPrima = devengo.reduce((s, m) => s + m.prima, 0)

  function guardar() {
    setError(null)
    setMensaje(null)
    const valor = parseFloat(pct)
    if (isNaN(valor) || valor < 0) {
      setError('Ingresá un % válido.')
      return
    }
    if (!vigenteDesde) {
      setError('Ingresá la fecha de vigencia.')
      return
    }
    startTransition(async () => {
      try {
        await setParametro('prima', valor, vigenteDesde)
        setMensaje('Tramo guardado.')
        setPct('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado')
      }
    })
  }

  return (
    <div className="space-y-6">
      {operar && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">% de prima</h3>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Porcentaje</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  placeholder="0.00"
                  className="w-28 px-2 py-1.5 text-xs border border-gray-200 rounded-lg font-mono"
                />
                <span className="text-xs text-gray-400">%</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Vigente desde</label>
              <input
                type="date"
                value={vigenteDesde}
                onChange={(e) => setVigenteDesde(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
              />
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={guardar}
              className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {pending ? 'Guardando…' : 'Guardar tramo'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          {mensaje && <p className="text-xs text-green-600 mt-2">{mensaje}</p>}
          {tramosOrdenados.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tramosOrdenados.map((t) => (
                <span key={t.vigenteDesde} className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                  {t.porcentaje}% desde {t.vigenteDesde}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Meses con devengo</p>
          <p className="text-2xl font-bold text-gray-900">{devengo.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Suma vigente acumulada</p>
          <p className="text-xl font-bold text-gray-900">{formatearMoneda(totalSuma)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Prima total devengada</p>
          <p className="text-xl font-bold text-gray-900">{formatearMoneda(totalPrima)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Mes</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Certificados</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Suma vigente</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Prima</th>
            </tr>
          </thead>
          <tbody>
            {devengo.map((m) => (
              <tr key={m.mes} className="border-b border-gray-50">
                <td className="px-3 py-2 text-xs text-gray-700">{mesLabel(m.mes)}</td>
                <td className="px-3 py-2 text-xs text-right text-gray-600">{m.certificados}</td>
                <td className="px-3 py-2 text-xs text-right font-mono text-gray-900">{formatearMoneda(m.sumaVigente)}</td>
                <td className="px-3 py-2 text-xs text-right font-mono text-gray-900">{formatearMoneda(m.prima)}</td>
              </tr>
            ))}
            {devengo.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">Sin devengo todavía</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
