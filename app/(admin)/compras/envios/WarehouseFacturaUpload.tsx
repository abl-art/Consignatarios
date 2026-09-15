'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { parseFacturaWarehouse, type FacturaWarehouseParseada, type Celda } from '@/lib/warehouse-factura'
import { guardarFacturaWarehouse } from '@/lib/actions/warehouse-factura'
import { formatearMoneda } from '@/lib/utils'

export default function WarehouseFacturaUpload() {
  const [parseada, setParseada] = useState<FacturaWarehouseParseada | null>(null)
  const [fechaFactura, setFechaFactura] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ conciliadas: number; revisar: number; pedidosGocelular: number | null; sobrefacturado: number | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    setParseada(null)

    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const hojaPor = (pred: (n: string) => boolean): Celda[][] | null => {
        const name = wb.SheetNames.find(n => pred(n.trim().toLowerCase()))
        if (!name) return null
        return XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[name], { header: 1, raw: true })
      }
      const resumen = hojaPor(n => n.startsWith('fact'))
      const out = hojaPor(n => n === 'out')
      const ingresos = hojaPor(n => n === 'in')
      const seguro = hojaPor(n => n === 'seguro')
      if (!resumen) { setError('No se encontró la hoja resumen de la factura (nombre "Fact. ...")'); return }
      if (!out) { setError('No se encontró la hoja "Out" con el detalle de expediciones'); return }
      if (!ingresos) { setError('No se encontró la hoja "IN" con las recepciones'); return }
      if (!seguro) { setError('No se encontró la hoja "Seguro" con el valor declarado diario'); return }

      const r = parseFacturaWarehouse({ resumen, out, ingresos, seguro })
      if ('error' in r) { setError(r.error); return }
      setParseada(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el Excel')
    }
  }

  async function handleSubmit() {
    if (!parseada || !fechaFactura) return
    setLoading(true)
    setError(null)
    try {
      const res = await guardarFacturaWarehouse(parseada, fechaFactura)
      if ('error' in res && res.error) { setError(res.error); return }
      if ('ok' in res) {
        setResult({
          conciliadas: res.conciliadas ?? 0,
          revisar: res.revisar ?? 0,
          pedidosGocelular: res.pedidosGocelular ?? null,
          sobrefacturado: res.sobrefacturado ?? null,
        })
        setParseada(null)
        setFechaFactura('')
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar la factura')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Cargar factura de Warehouse
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Subí el Excel mensual del warehouse de Andreani (hoja resumen + detalle IN/Out/Seguro).
        Las expediciones se cruzan automáticamente contra los pedidos de GOcelular.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200"
      />

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {parseada && (
        <div className="mt-4 space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-gray-500 text-xs">Período</span>
              <p className="font-semibold text-gray-900">{parseada.periodo}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Total facturado</span>
              <p className="font-semibold text-gray-900">{formatearMoneda(parseada.totalFacturado)}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Unidades expedidas</span>
              <p className="font-semibold text-gray-900">{parseada.unidadesOut.toLocaleString('es-AR')} <span className="text-gray-400 font-normal">({parseada.ordenesOut.toLocaleString('es-AR')} pedidos)</span></p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Recepciones</span>
              <p className="font-semibold text-gray-900">{parseada.ingresos.length} <span className="text-gray-400 font-normal">({parseada.bultosIn.toLocaleString('es-AR')} bultos)</span></p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Pico seguro</span>
              <p className="font-semibold text-gray-900">{parseada.valorPicoSeguro !== null ? formatearMoneda(parseada.valorPicoSeguro) : '—'}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-200 rounded-lg">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Concepto</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Detalle</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Cantidad</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">$ Unitario</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parseada.conceptos.map((c, i) => (
                  <tr key={i}>
                    <td className="px-4 py-1.5 font-medium text-gray-900">{c.item}</td>
                    <td className="px-4 py-1.5 text-gray-600">{c.detalle}</td>
                    <td className="px-4 py-1.5 text-right text-gray-700">{c.cantidad.toLocaleString('es-AR')}</td>
                    <td className="px-4 py-1.5 text-right text-gray-700">{formatearMoneda(c.precio_unitario)}</td>
                    <td className="px-4 py-1.5 text-right font-medium text-gray-900">{formatearMoneda(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parseada.avisos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 space-y-1">
              {parseada.avisos.map((a, i) => <p key={i}>⚠ {a}</p>)}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha de la factura (pago a 30 días)</label>
              <input
                type="date"
                value={fechaFactura}
                onChange={e => setFechaFactura(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !fechaFactura}
              className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? 'Conciliando...' : 'Conciliar y guardar'}
            </button>
            {!fechaFactura && <p className="text-xs text-gray-400 pb-2.5">Cargá la fecha del comprobante para guardar</p>}
          </div>
        </div>
      )}

      {result && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          <p>
            Factura procesada: {result.conciliadas} pedidos conciliados
            {result.revisar > 0 && (
              <span className="text-amber-700 font-semibold"> · {result.revisar} para revisar</span>
            )}
          </p>
          {result.sobrefacturado !== null && Math.abs(result.sobrefacturado) > 1 && (
            <p className="text-red-600 font-semibold mt-1">
              ⚠ OUT cobrado por artículo: {formatearMoneda(Math.round(Math.abs(result.sobrefacturado)))} de {result.sobrefacturado > 0 ? 'más' : 'menos'} vs {result.pedidosGocelular?.toLocaleString('es-AR')} pedidos expedidos según GOcelular — a reclamar
            </p>
          )}
        </div>
      )}
    </div>
  )
}
