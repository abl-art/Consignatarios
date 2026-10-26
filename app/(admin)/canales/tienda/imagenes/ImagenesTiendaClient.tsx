'use client'

import { useRef, useState, useTransition } from 'react'
import { getImagenesModelo, borrarImagenTienda, type ImagenTienda } from '@/lib/actions/imagenes-tienda'
import { slugModelo } from '@/lib/imagenes-tienda'

type Modelo = { id: string; nombre: string; categoria: string }

// Fondo cuadriculado para que se note la transparencia del PNG
const cuadriculado: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 10px 10px',
  backgroundColor: '#f9fafb',
}

async function descargarBlob(url: string, nombre: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function ImagenesTiendaClient({ modelos, conImagenes }: { modelos: Modelo[]; conImagenes: string[] }) {
  const [productoId, setProductoId] = useState('')
  const [imagenes, setImagenes] = useState<ImagenTienda[]>([])
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null)
  const [descargando, setDescargando] = useState(false)
  const [cargando, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const generados = useState(() => new Set(conImagenes))[0]

  const modelo = modelos.find(m => m.id === productoId)
  const slug = modelo ? slugModelo(modelo.nombre) : 'imagen'

  const categorias = [...new Set(modelos.map(m => m.categoria))]

  function elegirModelo(id: string) {
    setProductoId(id)
    setImagenes([])
    setErrores([])
    setAvisos([])
    setConfirmarBorrar(null)
    if (id) startTransition(async () => setImagenes(await getImagenesModelo(id)))
  }

  async function subirArchivos(files: FileList | null) {
    if (!files || !productoId) return
    setErrores([])
    setAvisos([])
    const nuevos: string[] = []
    const nuevosAvisos: string[] = []
    for (const file of Array.from(files)) {
      setSubiendo(file.name)
      const fd = new FormData()
      fd.append('archivo', file)
      fd.append('productoId', productoId)
      try {
        const res = await fetch('/api/imagenes-tienda', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) nuevos.push(`${file.name}: ${json.error}`)
        else if (json.advertencia) nuevosAvisos.push(`${file.name}: ${json.advertencia}`)
      } catch {
        nuevos.push(`${file.name}: error de red`)
      }
    }
    setSubiendo(null)
    setErrores(nuevos)
    setAvisos(nuevosAvisos)
    generados.add(productoId)
    setImagenes(await getImagenesModelo(productoId))
    if (inputRef.current) inputRef.current.value = ''
  }

  async function borrar(path: string) {
    const r = await borrarImagenTienda(path)
    if (r.error) setErrores([r.error])
    setConfirmarBorrar(null)
    setImagenes(await getImagenesModelo(productoId))
  }

  // Baja los PNG sueltos (no un ZIP): la tienda solo acepta imágenes individuales,
  // así quedan en Descargas listas para seleccionar y subir
  async function descargarTodas() {
    setDescargando(true)
    try {
      for (let i = 0; i < imagenes.length; i++) {
        await descargarBlob(imagenes[i].url, `${slug}-${i + 1}.png`)
        await new Promise(r => setTimeout(r, 300))
      }
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Modelo</label>
        <select
          value={productoId}
          onChange={e => elegirModelo(e.target.value)}
          className="w-full md:w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Elegí un modelo…</option>
          {categorias.map(cat => (
            <optgroup key={cat} label={cat}>
              {modelos.filter(m => m.categoria === cat).map(m => (
                <option key={m.id} value={m.id}>
                  {m.nombre}{generados.has(m.id) ? ' ✓' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-2">✓ = ya tiene imágenes generadas</p>
      </div>

      {productoId && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={e => subirArchivos(e.target.files)}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={!!subiendo}
              className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {subiendo ? `Procesando ${subiendo}…` : '+ Subir imágenes'}
            </button>
            {imagenes.length > 0 && (
              <button
                onClick={descargarTodas}
                disabled={descargando}
                className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {descargando ? 'Descargando…' : `⬇ Descargar todas (${imagenes.length})`}
              </button>
            )}
            <span className="text-xs text-gray-400">Hasta 7 por modelo · JPG, PNG o WebP · la tienda usa ~5</span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            💡 Para que salgan nítidas buscá fotos grandes (el producto ≥1700px): en Google Imágenes → Herramientas → Tamaño → Grande
          </p>

          {errores.length > 0 && (
            <div className="mb-4 text-sm text-red-600 space-y-1">
              {errores.map((e, i) => <p key={i}>✗ {e}</p>)}
            </div>
          )}

          {avisos.length > 0 && (
            <div className="mb-4 text-sm text-amber-600 space-y-1">
              {avisos.map((a, i) => <p key={i}>⚠ {a}</p>)}
            </div>
          )}

          {cargando ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : imagenes.length === 0 && !subiendo ? (
            <p className="text-sm text-gray-400">Este modelo todavía no tiene imágenes generadas.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {imagenes.map((img, i) => (
                <div key={img.path} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div style={cuadriculado} className="aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={`${slug}-${i + 1}`} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 text-xs bg-gray-50">
                    <button
                      onClick={() => descargarBlob(img.url, `${slug}-${i + 1}.png`)}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      ⬇ {slug}-{i + 1}.png
                    </button>
                    {confirmarBorrar === img.path ? (
                      <button onClick={() => borrar(img.path)} className="text-red-600 font-semibold">¿Seguro?</button>
                    ) : (
                      <button onClick={() => setConfirmarBorrar(img.path)} className="text-gray-400 hover:text-red-600">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
