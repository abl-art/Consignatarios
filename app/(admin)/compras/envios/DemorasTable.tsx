'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DemoraEntrega, MetodoEntrega } from '@/lib/demoras'
import { resumenDemoras, UMBRAL_DIAS } from '@/lib/demoras'
import { cargarRescate } from '@/lib/actions/rescates'
import { cargarSiniestro } from '@/lib/actions/siniestros'
import { descartarDemora } from '@/lib/actions/demoras'

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// OJO: el estado sale de la réplica de GOcelular (devices.trustonic_status) y
// el sync no cubre todos los equipos todos los días — puede quedar viejo (caso
// real: 17 días congelado en ready_for_use cuando Trustonic decía active).
// Por eso el chip muestra SIEMPRE de cuándo es el dato, en rojo si tiene +3 días.
function TrustonicChip({ status, updatedAt }: { status: string | null; updatedAt: string | null }) {
  if (!status) return <span className="text-gray-400">—</span>
  const s = status.toLowerCase()
  const cls = s === 'active' ? 'bg-red-50 text-red-700 border-red-200'
    : s === 'locked' ? 'bg-green-50 text-green-700 border-green-200'
    : s === 'ready_for_use' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'
  const emoji = s === 'active' ? '⚠️' : s === 'locked' ? '🔒' : ''
  // La fecha del dato va solo en el tooltip (pedido de Emiliano: chip chico);
  // el * marca dato con más de 3 días — pasar el mouse para ver de cuándo es
  const diasDato = updatedAt ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000) : null
  const viejo = diasDato !== null && diasDato > 3
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${cls}`}
      title={updatedAt
        ? `Dato de la réplica del ${new Date(updatedAt).toLocaleDateString('es-AR')}${viejo ? ' — VIEJO, verificar en la consola de Trustonic' : ''}`
        : 'Réplica de GOcelular'}
    >
      {emoji && `${emoji} `}{status}{viejo && <span className="font-bold">*</span>}
    </span>
  )
}

type Accion = 'siniestro' | 'rescate' | 'descartar'

const ACCIONES: { id: Accion; abrev: string; titulo: string; confirmCls: string }[] = [
  { id: 'siniestro', abrev: 'Sin.', titulo: 'Cargar como SINIESTRO (pasa a la pestaña Siniestros Distribución)', confirmCls: 'bg-red-600 hover:bg-red-700' },
  { id: 'rescate', abrev: 'Res.', titulo: 'Pedir RESCATE con motivo No Entregado (pasa a la pestaña Rescates)', confirmCls: 'bg-gray-900 hover:bg-gray-700' },
  { id: 'descartar', abrev: 'Desc.', titulo: 'DESCARTAR: verifiqué en Andreani que se entregó (los traces quedaron viejos)', confirmCls: 'bg-amber-600 hover:bg-amber-700' },
]

// Tres acciones abreviadas con confirmación en dos pasos. Cada una mueve la
// fila a su pestaña (o la saca de la lista) en el refresh.
function Acciones({ tracking }: { tracking: string | null }) {
  const router = useRouter()
  const [pendiente, setPendiente] = useState<Accion | null>(null)
  const [enviando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!tracking) return <span className="text-gray-400">—</span>

  function ejecutar(a: Accion) {
    startTransition(async () => {
      const res =
        a === 'siniestro' ? await cargarSiniestro(tracking!)
        : a === 'rescate' ? await cargarRescate(tracking!, 'No Entregado')
        : await descartarDemora(tracking!, 'Verificado entregado en Andreani')
      if (res.error) {
        setError(res.error)
        setPendiente(null)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center gap-1">
        {ACCIONES.map(a =>
          pendiente === a.id ? (
            <button
              key={a.id}
              disabled={enviando}
              onClick={() => ejecutar(a.id)}
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold text-white whitespace-nowrap disabled:opacity-50 ${a.confirmCls}`}
              title={`Confirmar: ${a.titulo}`}
            >
              {enviando ? '…' : `¿${a.abrev}?`}
            </button>
          ) : (
            <button
              key={a.id}
              disabled={enviando || pendiente !== null}
              onClick={() => { setPendiente(a.id); setError(null) }}
              className="px-1.5 py-0.5 rounded border border-gray-300 text-[11px] text-gray-600 hover:bg-gray-100 whitespace-nowrap disabled:opacity-40"
              title={a.titulo}
            >
              {a.abrev}
            </button>
          )
        )}
        {pendiente && !enviando && (
          <button onClick={() => setPendiente(null)} className="text-[11px] text-gray-400 hover:text-gray-600 px-0.5" title="Cancelar">
            ✕
          </button>
        )}
      </div>
      {error && <span className="text-[10px] text-red-600 max-w-[160px]">{error}</span>}
    </div>
  )
}

type Filtro = 'todos' | MetodoEntrega | 'criticos'

export default function DemorasTable({ demoras }: { demoras: DemoraEntrega[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const resumen = useMemo(() => resumenDemoras(demoras), [demoras])
  const visibles = useMemo(() => {
    if (filtro === 'criticos') return demoras.filter(d => d.diasDemora > 21)
    if (filtro === 'todos') return demoras
    return demoras.filter(d => d.metodo === filtro)
  }, [demoras, filtro])

  if (demoras.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-600">
          No hay entregas demoradas: todo lo despachado está dentro de los {UMBRAL_DIAS} días desde la
          creación del tracking.
        </p>
      </div>
    )
  }

  const tarjetas: { id: Filtro; label: string; cantidad: number; tono?: string }[] = [
    { id: 'todos', label: '📦 Demorados', cantidad: resumen.total },
    { id: 'domicilio', label: '🏠 Domicilio', cantidad: resumen.domicilio },
    { id: 'sucursal', label: '🏤 Sucursal', cantidad: resumen.sucursal },
    { id: 'criticos', label: '🔴 Más de 21 días', cantidad: resumen.criticos, tono: 'text-red-700' },
  ]

  return (
    <div>
      <p className="text-xs text-gray-500 max-w-3xl mb-4">
        Órdenes activas y despachadas que Andreani todavía no marcó como entregadas, con más de{' '}
        {UMBRAL_DIAS} días <b>desde la creación del tracking</b> (la demora de entrega es de Andreani;
        la columna Picking mide aparte los días confirmación → tracking, que son nuestros). Acciones:{' '}
        <b>Sin.</b> carga el siniestro, <b>Res.</b> pide el rescate (No Entregado), <b>Desc.</b> lo
        descarta si verificaste en Andreani que se entregó.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {tarjetas.map(t => {
          const activa = filtro === t.id
          return (
            <button
              key={t.id}
              onClick={() => setFiltro(activa ? 'todos' : t.id)}
              className={`bg-white border rounded-xl p-3 text-left transition-colors ${
                activa ? 'border-magenta-600 ring-1 ring-magenta-600' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-xs text-gray-500 mb-0.5">{t.label}</div>
              <div className={`text-2xl font-bold tabular-nums ${t.tono ?? 'text-gray-900'}`}>{t.cantidad}</div>
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Orden</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Cliente</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Producto / Destino</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Entrega</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600" title="Confirmación de la orden → creación del tracking en Andreani">Conf. → Tracking</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600" title="Días entre la confirmación y la creación del tracking — demora de picking, nuestra">Pick.</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600" title="Días desde la creación del tracking sin entrega — demora de Andreani">Días</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Último evento</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Tracking / Order ID</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600" title="Orden GOcuotas activa + estado Trustonic (réplica)">GOcuotas · Trustonic</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map(d => (
              <tr key={`${d.orderNumber}-${d.tracking}`} className="hover:bg-gray-50 align-top">
                <td className="px-2 py-1.5 font-mono text-[11px]">{d.orderNumber}</td>
                <td className="px-2 py-1.5">
                  <div className="text-gray-900">{d.cliente || '—'}</div>
                  <div className="text-[10px] text-gray-400">{[d.dni, d.telefono].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="text-gray-900 max-w-[180px] truncate" title={d.producto ?? ''}>{d.producto ?? '—'}</div>
                  <div className="text-[10px] text-gray-400 max-w-[180px] truncate" title={d.destino}>{d.destino || '—'}</div>
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={`inline-block text-[11px] font-semibold rounded-full px-1.5 py-0.5 border ${
                      d.metodo === 'domicilio'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}
                  >
                    {d.metodo === 'domicilio' ? 'Dom.' : 'Suc.'}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                  {fecha(d.confirmadaAt)} → {fecha(d.trackingCreadoAt)}
                </td>
                <td className={`px-2 py-1.5 tabular-nums ${d.diasPicking > 3 ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
                  {d.diasPicking}
                </td>
                <td className={`px-2 py-1.5 font-bold tabular-nums text-sm ${d.diasDemora > 21 ? 'text-red-700' : 'text-gray-900'}`}>
                  {d.diasDemora}
                </td>
                <td className="px-2 py-1.5 text-gray-700">
                  <div className="max-w-[160px] truncate" title={d.ultimoEvento}>{d.ultimoEvento}</div>
                  {d.diasSinMovimiento !== null && (
                    <div className={`text-[10px] ${d.diasSinMovimiento > 5 ? 'text-red-600' : 'text-gray-400'}`}>
                      hace {d.diasSinMovimiento} {d.diasSinMovimiento === 1 ? 'día' : 'días'}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono text-[11px]">
                  {d.tracking ? (
                    <a
                      href={`https://www.andreani.com/envio/${d.tracking}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-700 hover:underline block"
                      title="Ver el tracking en vivo en Andreani (los traces de acá pueden estar desactualizados)"
                    >
                      {d.tracking}
                    </a>
                  ) : (
                    <span className="text-gray-600 block">—</span>
                  )}
                  <span className="text-gray-400">{d.gocuotasOrderId ?? '—'}</span>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-col items-start gap-0.5">
                    {d.ordenActiva !== null && (
                      <span
                        className={`inline-block text-[11px] font-semibold rounded-full px-1.5 py-0.5 border ${
                          d.ordenActiva
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {d.ordenActiva ? 'Activa' : 'Anulada'}
                      </span>
                    )}
                    <TrustonicChip status={d.trustonicStatus} updatedAt={d.trustonicUpdatedAt} />
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Acciones tracking={d.tracking} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
