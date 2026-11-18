'use client'

// Form de creación de una cosecha: arma un DefCosecha a partir de los
// filtros (reusa FiltrosIndicadores para canal/bloqueo/segmento/merchant-store,
// mismo patrón que PD/DPD/Vintage), lo previsualiza contra la réplica
// (previewCosecha, sin escribir nada) y recién al confirmar lo congela
// (crearCosecha, inserta en Supabase). Cambiar cualquier campo invalida el
// preview — el botón Crear queda deshabilitado hasta volver a previsualizar.

import { useEffect, useMemo, useState } from 'react'
import FiltrosIndicadores from './FiltrosIndicadores'
import type { Canal } from './CanalPills'
import type { BloqueoFiltro } from './BloqueoPills'
import type { MerchantTercero } from '@/lib/actions/finanzas'
import { getOpcionesCosechas, previewCosecha, crearCosecha } from '@/lib/actions/cosechas'
import { ESTADOS_TRUSTONIC, MAX_ORDENES_COSECHA, validarDefCosecha } from '@/lib/cosechas'
import type { Cosecha, DefCosecha, GrupoModelo } from '@/lib/cosechas'
import { formatearMoneda } from '@/lib/utils'

type PreviewResult = Awaited<ReturnType<typeof previewCosecha>>

const LABELS_TRUSTONIC: Record<string, string> = {
  active: 'Activo',
  locked: 'Bloqueado',
  ready_for_use: 'Listo para uso',
  idle: 'Inactivo',
  released: 'Liberado',
  returned: 'Devuelto',
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR')
}

interface Props {
  merchants: MerchantTercero[]
  onCreada: (c: Cosecha) => void
}

export default function CosechaForm({ merchants, onCreada }: Props) {
  const [nombre, setNombre] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [canal, setCanalRaw] = useState<Canal>('total')
  const [bloqueo, setBloqueo] = useState<BloqueoFiltro>('todas')
  const [merchantId, setMerchantId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [segmentoLetra, setSegmentoLetra] = useState('')
  const [segmentoNumero, setSegmentoNumero] = useState('')
  const [trustonicSel, setTrustonicSel] = useState<string[]>([])
  const [modelosSel, setModelosSel] = useState<string[]>([])
  const [modelosBusqueda, setModelosBusqueda] = useState('')
  const [limiteStr, setLimiteStr] = useState('')

  const [opciones, setOpciones] = useState<GrupoModelo[]>([])
  const [opcionesCargando, setOpcionesCargando] = useState(true)

  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [creando, setCreando] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    getOpcionesCosechas()
      .then(r => { if (vivo) setOpciones(r.modelos) })
      .catch(() => {})
      .finally(() => { if (vivo) setOpcionesCargando(false) })
    return () => { vivo = false }
  }, [])

  const setCanal = (c: Canal) => {
    setCanalRaw(c)
    if (c !== 'terceros') {
      setMerchantId('')
      setStoreId('')
    }
  }
  const setMerchant = (m: string) => {
    setMerchantId(m)
    setStoreId('')
  }

  function toggleTrustonic(estado: string) {
    setTrustonicSel(prev => (prev.includes(estado) ? prev.filter(e => e !== estado) : [...prev, estado]))
  }
  function toggleModelo(label: string) {
    setModelosSel(prev => (prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]))
  }

  const def: DefCosecha = useMemo(() => ({
    nombre,
    fechaDesde,
    fechaHasta,
    filtros: {
      canal,
      merchantId: canal === 'terceros' && merchantId ? merchantId : undefined,
      storeId: canal === 'terceros' && storeId ? storeId : undefined,
      segmentoLetra: segmentoLetra || undefined,
      segmentoNumero: segmentoNumero || undefined,
      bloqueo: bloqueo === 'todas' ? undefined : bloqueo,
      trustonic: trustonicSel.length > 0 ? trustonicSel : undefined,
      modelos: modelosSel.length > 0 ? modelosSel : undefined,
    },
    limite: limiteStr.trim() === '' ? null : Number(limiteStr),
  }), [nombre, fechaDesde, fechaHasta, canal, merchantId, storeId, segmentoLetra, segmentoNumero, bloqueo, trustonicSel, modelosSel, limiteStr])

  // Cualquier cambio en el def invalida el preview anterior — se vuelve a
  // habilitar "Crear cosecha" solo después de un nuevo preview ok.
  const defJson = JSON.stringify(def)
  useEffect(() => {
    setPreview(null)
    setCreateError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defJson])

  async function handlePreview() {
    const errorLocal = validarDefCosecha(def)
    if (errorLocal) {
      setPreview({ ok: false, error: errorLocal })
      return
    }
    setPreviewing(true)
    try {
      const res = await previewCosecha(def)
      setPreview(res)
    } finally {
      setPreviewing(false)
    }
  }

  function resetForm() {
    setNombre('')
    setFechaDesde('')
    setFechaHasta('')
    setCanalRaw('total')
    setBloqueo('todas')
    setMerchantId('')
    setStoreId('')
    setSegmentoLetra('')
    setSegmentoNumero('')
    setTrustonicSel([])
    setModelosSel([])
    setModelosBusqueda('')
    setLimiteStr('')
    setPreview(null)
    setCreateError(null)
  }

  async function handleCrear() {
    if (!preview?.ok) return
    setCreando(true)
    setCreateError(null)
    try {
      const res = await crearCosecha(def)
      if (res.ok) {
        onCreada(res.cosecha)
        resetForm()
      } else {
        setCreateError(res.error)
      }
    } finally {
      setCreando(false)
    }
  }

  const modelosFiltrados = opciones.filter(o => o.label.toLowerCase().includes(modelosBusqueda.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="ej. Cohorte Nov 2026 Knox"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={e => setFechaDesde(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={e => setFechaHasta(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <FiltrosIndicadores
        canal={canal}
        setCanal={setCanal}
        bloqueo={bloqueo}
        setBloqueo={setBloqueo}
        merchantId={merchantId}
        setMerchant={setMerchant}
        storeId={storeId}
        setStore={setStoreId}
        segmentoLetra={segmentoLetra}
        setSegmentoLetra={setSegmentoLetra}
        segmentoNumero={segmentoNumero}
        setSegmentoNumero={setSegmentoNumero}
        merchants={merchants}
        cargando={false}
      />

      <div>
        <p className="text-xs text-gray-500 mb-1.5">Estado Trustonic (vacío = todos)</p>
        <div className="flex flex-wrap gap-2">
          {ESTADOS_TRUSTONIC.map(estado => (
            <label
              key={estado}
              className={`px-3 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors ${
                trustonicSel.includes(estado) ? 'bg-magenta-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={trustonicSel.includes(estado)}
                onChange={() => toggleTrustonic(estado)}
              />
              {LABELS_TRUSTONIC[estado] ?? estado}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-1.5">Modelos (vacío = todos)</p>
        <input
          type="text"
          value={modelosBusqueda}
          onChange={e => setModelosBusqueda(e.target.value)}
          placeholder="Buscar modelo…"
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs mb-2"
        />
        <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
          {opcionesCargando ? (
            <p className="text-xs text-gray-400 px-1">Cargando modelos…</p>
          ) : modelosFiltrados.length === 0 ? (
            <p className="text-xs text-gray-400 px-1">Sin coincidencias</p>
          ) : (
            modelosFiltrados.map(o => (
              <label key={o.label} className="flex items-center justify-between gap-2 px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-50 rounded cursor-pointer">
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={modelosSel.includes(o.label)} onChange={() => toggleModelo(o.label)} />
                  {o.label}
                </span>
                <span className="text-gray-400">{o.n}</span>
              </label>
            ))
          )}
        </div>
        {modelosSel.length > 0 && (
          <p className="text-[11px] text-gray-400 mt-1">
            {modelosSel.length} modelo{modelosSel.length > 1 ? 's' : ''} elegido{modelosSel.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="max-w-[200px]">
        <label className="block text-xs text-gray-500 mb-1">Límite de órdenes</label>
        <input
          type="number"
          min={1}
          max={MAX_ORDENES_COSECHA}
          value={limiteStr}
          onChange={e => setLimiteStr(e.target.value)}
          placeholder="ej. 500"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={previewing}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {previewing ? 'Previsualizando…' : 'Previsualizar'}
        </button>
        <button
          type="button"
          onClick={handleCrear}
          disabled={!preview?.ok || creando}
          className="px-4 py-2 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {creando ? 'Creando…' : 'Crear cosecha'}
        </button>
      </div>

      {preview && (
        preview.ok ? (
          <p className="text-xs text-green-700">
            {preview.seleccionadas} seleccionadas de {preview.disponibles} disponibles · Monto financiado {formatearMoneda(preview.montoTotal)}
            {preview.primeraVenta && preview.ultimaVenta && (
              <> · {formatFecha(preview.primeraVenta)} a {formatFecha(preview.ultimaVenta)}</>
            )}
          </p>
        ) : (
          <p className="text-xs text-red-600">{preview.error}</p>
        )
      )}
      {createError && <p className="text-xs text-red-600">{createError}</p>}
    </div>
  )
}
