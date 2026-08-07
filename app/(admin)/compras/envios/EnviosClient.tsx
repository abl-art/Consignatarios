'use client'

import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { conciliarFacturaEnvios, type EnvioCSVRow } from '@/lib/actions/envios'
import { useRouter } from 'next/navigation'

export default function EnviosClient() {
  const [rows, setRows] = useState<EnvioCSVRow[] | null>(null)
  const [parseInfo, setParseInfo] = useState<{ total: number; envios: number; nroLegal: string; fechaDesde: string; fechaHasta: string; descartados: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ conciliados: number; sobrantes: number; montoSobrante: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = Papa.parse<string[]>(text.trim(), { delimiter: ';', skipEmptyLines: true })
      const data = parsed.data

      if (data.length <= 1) {
        setError('El archivo está vacío o solo tiene encabezados')
        return
      }

      // Contratos que corresponden exclusivamente a GOcelular
      const CONTRATOS_GOCELULAR = new Set(['0400039408', '0400039410', '0400039412', '0400039414'])

      const csvRows: EnvioCSVRow[] = []
      let descartados = 0
      for (let i = 1; i < data.length; i++) {
        const row = data[i]
        if (!row[2]?.trim()) continue // skip rows without Nro. Envio

        const contrato = row[5]?.trim() || ''
        if (!CONTRATOS_GOCELULAR.has(contrato)) {
          descartados++
          continue
        }

        const importeStr = (row[18] || '0').replace(/\./g, '').replace(',', '.')
        csvRows.push({
          nro_envio: row[2].trim(),
          fecha_envio: row[3]?.trim() || '',
          concepto: row[7]?.trim() || '',
          importe: parseFloat(importeStr) || 0,
          localidad_destino: row[24]?.trim() || '',
          cp_destino: row[23]?.trim() || '',
          sucursal_destino: row[26]?.trim() || '',
          nro_legal: row[28]?.trim() || '',
          fecha_comprobante: row[29]?.trim() || '',
        })
      }

      if (csvRows.length === 0) {
        setError('No se encontraron filas válidas')
        return
      }

      // Calculate summary
      const uniqueEnvios = new Set(csvRows.map(r => r.nro_envio))
      const fechas = csvRows.map(r => r.fecha_envio).filter(Boolean).sort()
      const formatDateDisplay = (d: string) => {
        if (d.length === 8) return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`
        return d
      }

      setRows(csvRows)
      setParseInfo({
        total: csvRows.length,
        envios: uniqueEnvios.size,
        nroLegal: csvRows[0].nro_legal,
        descartados,
        fechaDesde: formatDateDisplay(fechas[0]),
        fechaHasta: formatDateDisplay(fechas[fechas.length - 1]),
      })
    }
    reader.readAsText(file, 'utf-8')
  }

  async function handleSubmit() {
    if (!rows) return
    setLoading(true)
    setError(null)

    try {
      const res = await conciliarFacturaEnvios(rows)

      if ('error' in res && res.error) {
        setError(res.error)
        return
      }

      if ('ok' in res) {
        setResult({
          conciliados: res.conciliados ?? 0,
          sobrantes: res.sobrantes ?? 0,
          montoSobrante: res.montoSobrante ?? 0,
        })
        setRows(null)
        setParseInfo(null)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al conciliar la factura')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Cargar factura de Andreani
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Subí el CSV de detalle de facturación de Andreani. Se cruza automáticamente contra los envíos de GOcelular.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200"
      />

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {parseInfo && (
        <div className="mt-4 space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-gray-500 text-xs">Nro. Legal</span>
              <p className="font-semibold text-gray-900">{parseInfo.nroLegal}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Período</span>
              <p className="font-semibold text-gray-900">{parseInfo.fechaDesde} — {parseInfo.fechaHasta}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Envíos GOcelular</span>
              <p className="font-semibold text-gray-900">{parseInfo.envios}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Filas procesadas</span>
              <p className="font-semibold text-gray-900">{parseInfo.total}</p>
            </div>
            <div>
              <span className="text-gray-500 text-xs">Otros contratos</span>
              <p className="font-semibold text-orange-600">{parseInfo.descartados} descartadas</p>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Conciliando...' : 'Conciliar factura'}
          </button>
        </div>
      )}

      {result && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          Factura procesada: {result.conciliados} envíos conciliados
          {result.sobrantes > 0 && (
            <span className="text-red-600 font-semibold">
              {' '}· {result.sobrantes} sobrantes (${new Intl.NumberFormat('es-AR').format(result.montoSobrante)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}
