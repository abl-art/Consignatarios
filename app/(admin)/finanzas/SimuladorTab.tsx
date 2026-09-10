'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { guardarProducto, type ProductoFinanciero } from '@/lib/actions/productos'
import type { DatosSimulador } from '@/lib/actions/simulador-datos'
import {
  simularFlujoV2, resolverPalanca, tirImplicita, generarNombreV2,
  oaPorOperacion, type ParamsV2, type Modalidad, type SplitConfig,
} from '@/lib/simulador-v2'

interface Props {
  productos: ProductoFinanciero[]
  datos: DatosSimulador
}

const fmt$ = (v: number) => '$' + Math.round(v).toLocaleString('es-AR')
const fmtPct = (v: number) => (v * 100).toFixed(2) + '%'
const fmtK = (v: number) => {
  if (v === 0) return ''
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + Math.round(abs / 1_000) + 'K'
  return sign + Math.round(abs).toString()
}
const redondear1 = (v: number) => Math.round(v * 10) / 10

const INPUT = 'w-full px-2 py-1.5 border border-gray-300 rounded text-xs'
const LABEL = 'block text-gray-500 mb-1'
const SUBTITULO = 'text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2'

function paramsIniciales(modalidad: Modalidad, datos: DatosSimulador): ParamsV2 {
  const canal = modalidad === 'propia' ? datos.propia : datos.terceros
  const cuotas = 9
  return {
    schema_version: 2,
    modalidad,
    costo_sin_iva: 0,
    multiplo: 2,
    modelo_id: null,
    modelo_nombre: null,
    flete: 0,
    order_amount: canal.ticket_promedio ? Math.round(canal.ticket_promedio) : 150_000,
    tasa_descuento_pct: 15,
    cuotas,
    anticipo_pct: redondear1(100 / cuotas),
    operaciones_por_mes: [1],
    splits: [{ plazo_dias: 0, porcentaje: 100 }],
    costos_operativos_pct: 2,
    imp_creditos_pct: 0.6,
    imp_debitos_pct: 0.6,
    iibb_pct: 4,
    incobrabilidad_pct: canal.incobrabilidad_pct !== null ? redondear1(canal.incobrabilidad_pct) : 3,
    mora_dias: canal.mora_dias !== null ? Math.round(canal.mora_dias) : 15,
    tna_fondeo_pct: 45,
    objetivo_pct_oa: 15,
  }
}

const MODALIDADES: { id: Modalidad; titulo: string; desc: string; bg: string; iconPath: string }[] = [
  {
    id: 'propia',
    titulo: 'Venta Propia',
    desc: 'Vendés el equipo y originás el crédito. La palanca es el múltiplo sobre el costo.',
    bg: 'bg-emerald-600',
    iconPath: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  },
  {
    id: 'terceros',
    titulo: 'Venta de Terceros',
    desc: 'El comercio vende, vos originás el crédito y cobrás tasa de descuento.',
    bg: 'bg-indigo-600',
    iconPath: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
]

export default function SimuladorTab({ productos, datos }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [modalidad, setModalidad] = useState<Modalidad | null>(null)
  const [params, setParams] = useState<ParamsV2 | null>(null)
  const [opsStr, setOpsStr] = useState('1')
  const [nombre, setNombre] = useState('')
  const [nombreEditado, setNombreEditado] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)

  function up<K extends keyof ParamsV2>(key: K, value: ParamsV2[K]) {
    setParams(prev => (prev ? { ...prev, [key]: value } : prev))
  }

  function elegirModalidad(m: Modalidad) {
    setModalidad(m)
    setParams(paramsIniciales(m, datos))
    setOpsStr('1')
    setNombreEditado(false)
  }

  function setCuotas(valor: number) {
    setParams(prev => {
      if (!prev) return prev
      const nuevas = Math.max(1, Math.round(valor) || 1)
      const eraDefault = prev.anticipo_pct === redondear1(100 / prev.cuotas)
      return {
        ...prev,
        cuotas: nuevas,
        anticipo_pct: eraDefault ? redondear1(100 / nuevas) : prev.anticipo_pct,
      }
    })
  }

  function elegirModelo(productoId: string) {
    setParams(prev => {
      if (!prev) return prev
      if (!productoId) return { ...prev, modelo_id: null, modelo_nombre: null }
      const f = datos.modelos.find(m => m.productoId === productoId)
      if (!f) return prev
      return { ...prev, modelo_id: f.productoId, modelo_nombre: f.nombre, costo_sin_iva: f.costo ?? prev.costo_sin_iva }
    })
  }

  function handleOpsChange(valor: string) {
    setOpsStr(valor)
    const nums = valor.split(',').map(s => Number(s.trim()) || 0)
    setParams(prev => (prev ? { ...prev, operaciones_por_mes: nums } : prev))
  }

  function updateSplit(idx: number, field: keyof SplitConfig, value: number) {
    setParams(prev => {
      if (!prev) return prev
      const splits = [...prev.splits]
      splits[idx] = { ...splits[idx], [field]: value }
      return { ...prev, splits }
    })
  }

  function setSplitCount(n: number) {
    setParams(prev => {
      if (!prev) return prev
      const cant = Math.min(12, Math.max(1, Math.round(n) || 1))
      const splits: SplitConfig[] = []
      const pct = Math.floor(100 / cant)
      for (let i = 0; i < cant; i++) {
        splits.push({
          plazo_dias: prev.splits[i]?.plazo_dias ?? 30 * i,
          porcentaje: i === cant - 1 ? 100 - pct * (cant - 1) : pct,
        })
      }
      return { ...prev, splits }
    })
  }

  const sumaSplits = params ? params.splits.reduce((s, sp) => s + sp.porcentaje, 0) : 0
  const splitsOk = params !== null && sumaSplits === 100

  const sim = useMemo(() => (params ? simularFlujoV2(params) : null), [params])
  // 60 simulaciones por corrida: sólo con splits válidos y costo cargado
  const solver = useMemo(() => {
    if (!params || !splitsOk) return null
    if (params.modalidad === 'propia' && params.costo_sin_iva <= 0) return null
    return resolverPalanca(params)
  }, [params, splitsOk])
  const tir = useMemo(() => (params ? tirImplicita(params) : null), [params])

  const modelosDisponibles = useMemo(
    () => datos.modelos.filter(m => m.costo !== null).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [datos.modelos],
  )

  // Carga desde Productos: ?producto=<id>
  const productoParam = searchParams.get('producto')
  useEffect(() => {
    if (!productoParam) return
    const p = productos.find(x => x.id === productoParam)
    if (p && (p.parametros as { schema_version?: number }).schema_version === 2) {
      const loaded = p.parametros as unknown as ParamsV2
      setModalidad(loaded.modalidad)
      setParams(loaded)
      setOpsStr(loaded.operaciones_por_mes.join(', '))
      setNombre(p.nombre)
      setNombreEditado(true)
    }
    router.replace(`${pathname}?tab=simulador`, { scroll: false })
  }, [productoParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nombre sugerido mientras el usuario no lo pise
  useEffect(() => {
    if (!params || nombreEditado) return
    setNombre(generarNombreV2(params))
  }, [params, nombreEditado])

  // Un cambio de parámetros invalida el error del intento anterior
  useEffect(() => { setErrorGuardar(null) }, [params])

  async function handleGuardar() {
    if (!params || !sim || !splitsOk) return
    setSaving(true)
    setErrorGuardar(null)
    let res: Awaited<ReturnType<typeof guardarProducto>>
    try {
      res = await guardarProducto(
        nombre.trim() || generarNombreV2(params),
        params as unknown as Record<string, unknown>,
        { ...sim.indicadores, tir } as unknown as Record<string, unknown>,
      )
    } catch (e) {
      res = { error: e instanceof Error ? e.message : 'Error de red al guardar' }
    }
    setSaving(false)
    if (res?.error) {
      setErrorGuardar(res.error)
      return
    }
    router.refresh()
  }

  // ---- Selector de modalidad ----
  if (!modalidad || !params || !sim) {
    return (
      <div>
        <h3 className="font-semibold text-gray-900 mb-1">¿Qué querés simular?</h3>
        <p className="text-sm text-gray-500 mb-6">Elegí la modalidad: cada una tiene su propia palanca y su propio flujo de fondos.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
          {MODALIDADES.map(m => (
            <button
              key={m.id}
              onClick={() => elegirModalidad(m.id)}
              className="text-left bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className={`${m.bg} px-5 py-4 flex items-center gap-3`}>
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={m.iconPath} />
                </svg>
                <h2 className="text-lg font-semibold text-white">{m.titulo}</h2>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-500">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const esPropia = modalidad === 'propia'
  const canal = esPropia ? datos.propia : datos.terceros
  const ind = sim.indicadores
  const modeloElegido = params.modelo_id ? modelosDisponibles.find(m => m.productoId === params.modelo_id) : undefined
  // Producto guardado con un modelo que hoy no está en la lista: lo mantenemos visible
  const modeloHuerfano = params.modelo_id !== null && !modeloElegido
  const faltaCosto = esPropia && params.costo_sin_iva <= 0
  const objetivo = params.objetivo_pct_oa / 100
  const cumpleObjetivo = ind.resultado_pct_oa >= objetivo
  const oa = oaPorOperacion(params)

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setModalidad(null)}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          ‹ Cambiar modalidad
        </button>
        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${esPropia ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
          {esPropia ? 'Venta Propia' : 'Venta de Terceros'}
        </span>
      </div>

      {/* Parámetros */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        {/* Operación */}
        <div>
          <p className={SUBTITULO}>Operación</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {esPropia ? (
              <>
                <div className="col-span-2">
                  <label className={LABEL}>Modelo</label>
                  <select
                    value={params.modelo_id ?? ''}
                    onChange={e => elegirModelo(e.target.value)}
                    className={INPUT}
                  >
                    <option value="">— modelo genérico —</option>
                    {modeloHuerfano && (
                      <option value={params.modelo_id ?? ''}>{params.modelo_nombre ?? 'modelo guardado'} (sin costo hoy)</option>
                    )}
                    {modelosDisponibles.map(m => (
                      <option key={m.productoId} value={m.productoId}>{m.nombre}</option>
                    ))}
                  </select>
                  {modeloElegido && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Hoy: PVP {modeloElegido.pvp !== null ? fmt$(modeloElegido.pvp) : '—'} · múltiplo {modeloElegido.multiplo} · cuota {modeloElegido.cuota !== null ? fmt$(modeloElegido.cuota) : '—'} · tienda {modeloElegido.precioTienda !== null ? fmt$(modeloElegido.precioTienda) : '—'}
                    </p>
                  )}
                </div>
                <div>
                  <label className={LABEL}>Costo sin IVA ($)</label>
                  <input type="number" value={params.costo_sin_iva} onChange={e => up('costo_sin_iva', Number(e.target.value))} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Múltiplo actual</label>
                  <input type="number" step="0.01" min="0" value={params.multiplo} onChange={e => up('multiplo', Number(e.target.value))} className={INPUT} />
                  <p className="text-[10px] text-gray-400 mt-1">PVP {fmt$(oa)}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={LABEL}>Order amount ($)</label>
                  <input type="number" value={params.order_amount} onChange={e => up('order_amount', Number(e.target.value))} className={INPUT} />
                  <p className="text-[10px] text-gray-400 mt-1">
                    ticket real: {canal.ticket_promedio !== null ? fmt$(canal.ticket_promedio) : 's/d'}
                  </p>
                </div>
                <div>
                  <label className={LABEL}>Tasa descuento (%)</label>
                  <input type="number" step="0.1" value={params.tasa_descuento_pct} onChange={e => up('tasa_descuento_pct', Number(e.target.value))} className={INPUT} />
                </div>
              </>
            )}
            <div>
              <label className={LABEL}>Cuotas</label>
              <input type="number" min="1" max="24" value={params.cuotas} onChange={e => setCuotas(Number(e.target.value))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Anticipo (%)</label>
              <input type="number" step="0.1" value={params.anticipo_pct} onChange={e => up('anticipo_pct', Number(e.target.value))} className={INPUT} />
              <p className="text-[10px] text-gray-400 mt-1">default {redondear1(100 / params.cuotas)}%</p>
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Ops/mes (separar con coma)</label>
              <input type="text" value={opsStr} onChange={e => handleOpsChange(e.target.value)} placeholder="500, 500, 500" className={INPUT} />
            </div>
          </div>
        </div>

        {/* Costos e impuestos */}
        <div className="pt-4 border-t border-gray-200">
          <p className={SUBTITULO}>Costos e impuestos</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className={LABEL}>Costos op. (%)</label>
              <input type="number" step="0.1" value={params.costos_operativos_pct} onChange={e => up('costos_operativos_pct', Number(e.target.value))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Imp. créditos (%)</label>
              <input type="number" step="0.01" value={params.imp_creditos_pct} onChange={e => up('imp_creditos_pct', Number(e.target.value))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Imp. débitos (%)</label>
              <input type="number" step="0.01" value={params.imp_debitos_pct} onChange={e => up('imp_debitos_pct', Number(e.target.value))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>IIBB (%)</label>
              <input type="number" step="0.1" value={params.iibb_pct} onChange={e => up('iibb_pct', Number(e.target.value))} className={INPUT} />
            </div>
            {esPropia && (
              <div>
                <label className={LABEL}>Flete ($)</label>
                <input type="number" value={params.flete} onChange={e => up('flete', Number(e.target.value))} className={INPUT} />
              </div>
            )}
          </div>
        </div>

        {/* Riesgo del canal */}
        <div className="pt-4 border-t border-gray-200">
          <p className={SUBTITULO}>Riesgo del canal</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className={LABEL}>Incobrabilidad (%)</label>
              <input type="number" step="0.1" value={params.incobrabilidad_pct} onChange={e => up('incobrabilidad_pct', Number(e.target.value))} className={INPUT} />
              <p className="text-[10px] text-gray-400 mt-1">
                vintage: {canal.incobrabilidad_pct?.toFixed(1) ?? 's/d'}% · FPD: {canal.fpd_pct?.toFixed(1) ?? 's/d'}%
              </p>
            </div>
            <div>
              <label className={LABEL}>Mora (días)</label>
              <input type="number" value={params.mora_dias} onChange={e => up('mora_dias', Number(e.target.value))} className={INPUT} />
              <p className="text-[10px] text-gray-400 mt-1">mora real: {canal.mora_dias?.toFixed(0) ?? 's/d'}d</p>
            </div>
          </div>
        </div>

        {/* Fondeo y objetivo */}
        <div className="pt-4 border-t border-gray-200">
          <p className={SUBTITULO}>Fondeo y objetivo</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className={LABEL}>TNA fondeo (%)</label>
              <input type="number" step="0.1" value={params.tna_fondeo_pct} onChange={e => up('tna_fondeo_pct', Number(e.target.value))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Objetivo (% s/OA)</label>
              <input type="number" step="0.1" value={params.objetivo_pct_oa} onChange={e => up('objetivo_pct_oa', Number(e.target.value))} className={INPUT} />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-medium text-gray-600">
                {esPropia ? 'Splits de pago al proveedor:' : 'Splits de liquidación al comercio:'}
              </span>
              <input type="number" min="1" max="12" value={params.splits.length} onChange={e => setSplitCount(Number(e.target.value) || 1)} className="w-14 px-2 py-1 border border-gray-300 rounded text-xs" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {params.splits.map((s, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <span className="text-[10px] text-gray-400 w-4">{i + 1}.</span>
                  <input type="number" min="0" value={s.plazo_dias} onChange={e => updateSplit(i, 'plazo_dias', Number(e.target.value))} className="w-14 px-1 py-1 border border-gray-300 rounded text-[10px]" title="Plazo días" />
                  <span className="text-[10px] text-gray-400">d</span>
                  <input type="number" value={s.porcentaje} onChange={e => updateSplit(i, 'porcentaje', Number(e.target.value))} className="w-12 px-1 py-1 border border-gray-300 rounded text-[10px]" title="%" />
                  <span className="text-[10px] text-gray-400">%</span>
                </div>
              ))}
            </div>
            {!splitsOk && (
              <p className="text-[10px] text-red-500 mt-1">Los splits deben sumar 100% (actual: {sumaSplits}%)</p>
            )}
          </div>
        </div>
      </div>

      {/* Simulación (solver) */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
        <h3 className="font-semibold text-indigo-900 text-sm mb-3">Simulación</h3>
        {!splitsOk ? (
          <p className="text-sm text-red-600">Corregí los splits (deben sumar 100%) para calcular la palanca mínima.</p>
        ) : faltaCosto ? (
          <p className="text-sm text-gray-600">Elegí un modelo o cargá el costo sin IVA para calcular el múltiplo mínimo.</p>
        ) : solver === null ? null : (
          <div className="space-y-2">
            {esPropia ? (
              <>
                <p className="text-sm text-gray-700">
                  Múltiplo mínimo para obj {params.objetivo_pct_oa}%:{' '}
                  <span className="text-lg font-bold text-indigo-900">{solver.palanca.toFixed(2)}</span>
                  <span className="text-gray-500"> → PVP {fmt$(params.costo_sin_iva * solver.palanca)} · cuota {fmt$(params.costo_sin_iva * solver.palanca / params.cuotas)}</span>
                </p>
                <p className="text-sm text-gray-700">
                  Con tu múltiplo actual {params.multiplo}: resultado{' '}
                  <span className={`font-bold ${cumpleObjetivo ? 'text-green-700' : 'text-red-700'}`}>{fmtPct(ind.resultado_pct_oa)}</span>
                  <span className="text-gray-500"> · PVP {fmt$(oa)}</span>
                </p>
                {tir && (
                  <p className="text-sm text-gray-700">
                    Tasa implícita del crédito: TNA <span className="font-bold">{fmtPct(tir.tna)}</span> · TEA <span className="font-bold">{fmtPct(tir.tea)}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700">
                  Tasa de descuento mínima para obj {params.objetivo_pct_oa}%:{' '}
                  <span className="text-lg font-bold text-indigo-900">{solver.palanca.toFixed(1)}%</span>
                </p>
                <p className="text-sm text-gray-700">
                  Con tu tasa actual {params.tasa_descuento_pct}%: resultado{' '}
                  <span className={`font-bold ${cumpleObjetivo ? 'text-green-700' : 'text-red-700'}`}>{fmtPct(ind.resultado_pct_oa)}</span>
                  <span className="text-gray-500"> · OA {fmt$(oa)}</span>
                </p>
              </>
            )}
            {!solver.alcanzable && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                El objetivo no se alcanza ni con la palanca al tope del rango — revisá costos/incobrabilidad.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] text-gray-500 mb-1">Resultado</p>
          <p className={`text-xl font-bold ${cumpleObjetivo ? 'text-green-600' : 'text-red-600'}`}>{fmt$(ind.resultado)}</p>
          <p className="text-[10px] text-gray-400 mt-1">{fmtPct(ind.resultado_pct_oa)} s/OA (obj {params.objetivo_pct_oa}%)</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] text-gray-500 mb-1">Capital requerido</p>
          <p className="text-xl font-bold text-gray-900">{fmt$(ind.capital_requerido)}</p>
          <p className="text-[10px] text-gray-400 mt-1">promedio {fmt$(ind.capital_promedio)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] text-gray-500 mb-1">{esPropia ? 'CT' : 'Deuda'} / OA</p>
          <p className="text-xl font-bold text-gray-900">{(ind.ct_deuda_ratio * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] text-gray-500 mb-1">Rent. anual s/capital</p>
          {ind.sin_capital ? (
            <p className="text-sm font-bold text-green-600">No requiere capital</p>
          ) : ind.rent_anual_capital === null ? (
            <p className="text-sm font-bold text-gray-400">—</p>
          ) : (
            <p className={`text-xl font-bold ${ind.rent_anual_capital >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtPct(ind.rent_anual_capital)}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[10px] text-gray-500 mb-1">Payback</p>
          <p className="text-xl font-bold text-gray-900">
            {ind.sin_capital ? '—' : ind.payback === null ? 'No recupera' : `Mes ${ind.payback}`}
          </p>
        </div>
      </div>

      {/* Tabla del flujo */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900 text-sm">Flujo de fondos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: '10px' }}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-600 sticky left-0 bg-gray-50 min-w-[120px]">Concepto</th>
                {Array.from({ length: sim.meses }, (_, i) => (
                  <th key={i} className="text-right px-1.5 py-1.5 font-semibold text-gray-500 min-w-[60px]">Mes {i}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sim.filas.map((fila, idx) => (
                <tr key={idx} className={fila.esSubtotal ? 'bg-gray-50 font-bold' : fila.esAcumulado ? 'bg-blue-50 font-bold' : ''}>
                  <td className={`px-2 py-1 sticky left-0 ${fila.esSubtotal ? 'bg-gray-50 text-gray-900' : fila.esAcumulado ? 'bg-blue-50 text-blue-900' : 'bg-white text-gray-700'}`}>
                    {fila.concepto}
                  </td>
                  {fila.valores.map((v, m) => (
                    <td key={m} className={`px-1.5 py-1 text-right ${
                      fila.esAcumulado || fila.esSubtotal
                        ? v >= 0 ? 'text-green-700' : 'text-red-700'
                        : v > 0 ? 'text-green-700' : v < 0 ? 'text-red-700' : 'text-gray-300'
                    }`}>
                      {fmtK(Math.round(v))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guardar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Guardar como producto</h3>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <input
            type="text"
            value={nombre}
            onChange={e => { setNombre(e.target.value); setNombreEditado(true) }}
            placeholder="Nombre del producto"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            onClick={handleGuardar}
            disabled={saving || !splitsOk}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar como producto'}
          </button>
        </div>
        {errorGuardar && (
          <p className="text-xs text-red-600 mt-2">No se pudo guardar: {errorGuardar}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-2">
          El nombre se sugiere solo a partir de los parámetros; si lo editás, se respeta lo que escribiste.
        </p>
      </div>
    </div>
  )
}
