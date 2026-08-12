'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { registrarEntregaKits } from '@/lib/actions/proveedor-kits'

interface Producto {
  id: string
  nombre: string
  codigo: string
}

const PRECIO_DEFAULT = 7000

export default function EntregaForm({
  token,
  productos,
  precios,
}: {
  token: string
  productos: Producto[]
  precios: Record<string, number>
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(false)
  const [excelBase64, setExcelBase64] = useState<string | null>(null)
  const [excelNombre, setExcelNombre] = useState<string | null>(null)
  const [excelAviso, setExcelAviso] = useState<string | null>(null)

  const itemsConCantidad = productos.filter(p => (cantidades[p.id] ?? 0) > 0)
  const totalKits = Object.values(cantidades).reduce((s, q) => s + (q > 0 ? q : 0), 0)
  const totalImporte = itemsConCantidad.reduce(
    (s, p) => s + (cantidades[p.id] ?? 0) * (precios[p.id] ?? PRECIO_DEFAULT),
    0
  )

  function limpiarExcel() {
    setExcelBase64(null)
    setExcelNombre(null)
    setExcelAviso(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Lee el Excel, guarda el archivo (base64) y precarga cantidades matcheando
  // cada fila contra el SKU o el nombre del kit
  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buf = await file.arrayBuffer()

      let b64 = ''
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i += 0x8000) {
        b64 += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)))
      }
      setExcelBase64(btoa(b64))
      setExcelNombre(file.name)

      const wb = XLSX.read(buf)
      const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })

      const nuevas: Record<string, number> = {}
      const sinMatch: string[] = []
      for (const row of rows) {
        if (!Array.isArray(row) || row.length === 0) continue
        const celdas = row.map(c => String(c ?? '').trim())
        const kit = productos.find(p =>
          celdas.some(c => c.toLowerCase() === p.codigo.toLowerCase() || c.toLowerCase() === p.nombre.toLowerCase())
        )
        if (!kit) {
          // Solo avisar filas que parecen datos (tienen algun texto con KS- o "kit")
          const texto = celdas.join(' ').toLowerCase()
          if (texto.includes('ks-') || texto.includes('kit ')) sinMatch.push(celdas.filter(Boolean).join(' | '))
          continue
        }
        const cantidad = row
          .map(c => (typeof c === 'number' ? c : Number(String(c ?? '').trim())))
          .find(n => Number.isInteger(n) && n > 0)
        if (cantidad) nuevas[kit.id] = (nuevas[kit.id] ?? 0) + cantidad
      }

      if (Object.keys(nuevas).length === 0) {
        setExcelAviso(
          'No se encontraron kits en el Excel. Verificá que cada fila tenga el SKU (ej: KS-MOTO-G06) o el nombre exacto del kit y la cantidad. El archivo queda adjunto igual — cargá las cantidades a mano.'
        )
      } else {
        setCantidades(nuevas)
        setExcelAviso(
          `Se cargaron ${Object.values(nuevas).reduce((s, n) => s + n, 0)} kits desde el Excel. Revisá las cantidades antes de confirmar.` +
            (sinMatch.length > 0 ? ` Filas sin match: ${sinMatch.slice(0, 3).join(' / ')}` : '')
        )
      }
    } catch {
      limpiarExcel()
      setExcelAviso('No se pudo leer el archivo. Tiene que ser un Excel (.xlsx / .xls) o CSV.')
    }
  }

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
      })),
      excelBase64 ?? undefined
    )
    setEnviando(false)

    if (result.ok) {
      setExito(true)
      setCantidades({})
      limpiarExcel()
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
        className="inline-flex items-center gap-2 px-5 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
      >
        <span className="text-lg leading-none">+</span> Registrar Entrega
      </button>
    )
  }

  return (
    <div className="bg-white border border-green-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-green-50 border-b border-green-200 flex items-center justify-between">
        <h3 className="font-semibold text-green-900">Registrar entrega</h3>
        <button
          onClick={() => { setOpen(false); setCantidades({}); limpiarExcel() }}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
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
          {/* Carga de Excel */}
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-2">
              Subí el Excel de la entrega (queda adjunto al pedido para informarlo a GOcelular / Andreani).
              Formato: una fila por kit con SKU o nombre y cantidad.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcel}
                className="text-xs text-gray-600 file:mr-3 file:px-3 file:py-1.5 file:border-0 file:rounded-lg file:bg-green-100 file:text-green-700 file:font-semibold file:text-xs hover:file:bg-green-200 file:cursor-pointer"
              />
              {excelNombre && (
                <span className="inline-flex items-center gap-2 px-2.5 py-1 text-xs bg-green-50 border border-green-200 rounded-full text-green-800">
                  {excelNombre}
                  <button onClick={limpiarExcel} className="text-green-600 hover:text-green-900 font-bold">×</button>
                </span>
              )}
            </div>
            {excelAviso && (
              <p className="text-xs mt-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">{excelAviso}</p>
            )}
          </div>

          <div className="p-4">
            <p className="text-xs text-gray-500 mb-3">Cantidad de kits entregados por modelo:</p>
            <div className="space-y-2">
              {productos.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    value={cantidades[p.id] || ''}
                    onChange={e => setCantidades(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-right font-mono"
                  />
                  <span className="text-sm text-gray-700">{p.nombre}</span>
                  <span className="text-xs text-gray-400 font-mono">{p.codigo}</span>
                </div>
              ))}
            </div>
          </div>

          {totalKits > 0 && (
            <div className="px-4 pb-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex justify-between items-center">
                <span className="text-sm text-green-800">Total: <strong>{totalKits} kits</strong></span>
                <span className="text-sm text-green-800 font-semibold">
                  ${totalImporte.toLocaleString('es-AR')}
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
