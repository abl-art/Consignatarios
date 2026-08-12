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
  const [sinMatch, setSinMatch] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const itemsLeidos = productos.filter(p => (cantidades[p.id] ?? 0) > 0)
  const totalKits = itemsLeidos.reduce((s, p) => s + (cantidades[p.id] ?? 0), 0)
  const totalImporte = itemsLeidos.reduce(
    (s, p) => s + (cantidades[p.id] ?? 0) * (precios[p.id] ?? PRECIO_DEFAULT),
    0
  )
  const leido = itemsLeidos.length > 0

  function reset() {
    setCantidades({})
    setExcelBase64(null)
    setExcelNombre(null)
    setSinMatch([])
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function cerrar() {
    setOpen(false)
    reset()
  }

  // Lee el Excel: guarda el archivo (base64) y arma las cantidades matcheando
  // cada fila contra el SKU o el nombre del kit
  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const buf = await file.arrayBuffer()

      let b64 = ''
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i += 0x8000) {
        b64 += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)))
      }

      const wb = XLSX.read(buf)
      const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })

      const nuevas: Record<string, number> = {}
      const noMatcheadas: string[] = []
      for (const row of rows) {
        if (!Array.isArray(row) || row.length === 0) continue
        const celdas = row.map(c => String(c ?? '').trim())
        const kit = productos.find(p =>
          celdas.some(c => c.toLowerCase() === p.codigo.toLowerCase() || c.toLowerCase() === p.nombre.toLowerCase())
        )
        if (!kit) {
          const texto = celdas.join(' ').toLowerCase()
          if (texto.includes('ks-') || texto.includes('kit ')) noMatcheadas.push(celdas.filter(Boolean).join(' | '))
          continue
        }
        const cantidad = row
          .map(c => (typeof c === 'number' ? c : Number(String(c ?? '').trim())))
          .find(n => Number.isInteger(n) && n > 0)
        if (cantidad) nuevas[kit.id] = (nuevas[kit.id] ?? 0) + cantidad
      }

      if (Object.keys(nuevas).length === 0) {
        reset()
        setError(
          'No se encontraron kits en el archivo. Cada fila tiene que tener el SKU (ej: KS-MOTO-G06) o el nombre exacto del kit, y la cantidad.'
        )
        return
      }

      setExcelBase64(btoa(b64))
      setExcelNombre(file.name)
      setCantidades(nuevas)
      setSinMatch(noMatcheadas)
    } catch {
      reset()
      setError('No se pudo leer el archivo. Tiene que ser un Excel (.xlsx / .xls) o CSV.')
    }
  }

  async function handleSubmit() {
    if (totalKits === 0) return

    setEnviando(true)
    const result = await registrarEntregaKits(
      token,
      itemsLeidos.map(p => ({
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
      setTimeout(() => {
        setExito(false)
        cerrar()
        router.refresh()
      }, 1800)
    } else {
      alert(result.error ?? 'Error al registrar')
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
      >
        + Registrar Entrega
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg overflow-hidden">
            {exito ? (
              <div className="p-10 text-center">
                <svg className="w-10 h-10 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-900 font-semibold">Entrega registrada</p>
                <p className="text-xs text-gray-500 mt-1">Los kits quedan en tránsito al WH de Andreani</p>
              </div>
            ) : !leido ? (
              /* Paso 1: seleccionar archivo */
              <>
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Registrar entrega</h3>
                  <button onClick={cerrar} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                </div>
                <div className="p-5">
                  <p className="text-sm text-gray-600 mb-4">
                    Subí el Excel de la entrega. Cada fila con el SKU o nombre del kit y la cantidad.
                    El archivo queda adjunto al pedido para informarlo a GOcelular / Andreani.
                  </p>
                  <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 transition-colors">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcel}
                      className="hidden"
                    />
                    <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm font-medium text-gray-700">Seleccionar archivo</p>
                    <p className="text-xs text-gray-400 mt-1">Excel (.xlsx, .xls) o CSV</p>
                  </label>
                  {error && (
                    <p className="text-xs mt-3 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                  )}
                </div>
              </>
            ) : (
              /* Paso 2: confirmar lo leido */
              <>
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Confirmar entrega</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{excelNombre}</p>
                  </div>
                  <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700">Cambiar archivo</button>
                </div>
                <div className="p-5">
                  <p className="text-xs text-gray-500 mb-3">Revisá que el archivo se haya leído bien:</p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Kit</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">SKU</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {itemsLeidos.map(p => (
                          <tr key={p.id}>
                            <td className="px-4 py-2 text-gray-900">{p.nombre}</td>
                            <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.codigo}</td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-900">{cantidades[p.id]}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t border-gray-200">
                        <tr className="font-semibold text-gray-900">
                          <td className="px-4 py-2">Total</td>
                          <td className="px-4 py-2" />
                          <td className="px-4 py-2 text-right">{totalKits}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="flex justify-between items-center text-sm text-gray-600 mb-3">
                    <span>Importe total</span>
                    <span className="font-semibold text-gray-900">${totalImporte.toLocaleString('es-AR')}</span>
                  </div>
                  {sinMatch.length > 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                      Filas del archivo sin match (no se incluyen): {sinMatch.slice(0, 3).join(' / ')}
                      {sinMatch.length > 3 ? ` y ${sinMatch.length - 3} más` : ''}
                    </p>
                  )}
                  <div className="flex gap-3 justify-end">
                    <button onClick={cerrar} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={enviando}
                      className="px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                      {enviando ? 'Registrando...' : `Confirmar entrega (${totalKits} kits)`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
