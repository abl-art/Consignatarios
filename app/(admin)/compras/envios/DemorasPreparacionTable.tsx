'use client'

// Demoras de PREPARACIÓN: cola autolimpiante y sin acciones — las órdenes
// entran a las 48h hábiles sin tracking y desaparecen solas cuando GOcelular
// genera el número de seguimiento. La razón dice a quién reclamar.

import { useState } from 'react'
import type { DemoraPreparacion, OrdenPreparacion, RazonDemoraPreparacion } from '@/lib/demoras-preparacion'
import { HORAS_DEMORA_PREPARACION } from '@/lib/demoras-preparacion'

export type FilaDemoraPreparacion = DemoraPreparacion<
  OrdenPreparacion & {
    gocuotasOrderId: string | null
    gocuotasStatus: string | null
    trustonicStatus: string | null
    trustonicUpdatedAt: string | null
  }
>

const fmt1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

function RazonChip({ razon, detalle }: { razon: RazonDemoraPreparacion; detalle: string | null }) {
  const estilos: Record<RazonDemoraPreparacion, { clase: string; hint: string }> = {
    'SIN MOTIVO': { clase: 'text-rose-700 bg-rose-50 border-rose-200', hint: 'Nada explica la demora: hay stock, el pedido está en el warehouse sin error y no salió — reclamar a GOcelular/Andreani' },
    'Rechazado por Andreani': { clase: 'text-amber-700 bg-amber-50 border-amber-200', hint: detalle ?? 'El pedido de warehouse requiere atención' },
    'Sin stock': { clase: 'text-blue-700 bg-blue-50 border-blue-200', hint: 'El modelo no tiene unidades disponibles hoy (neto de picking) — reponer o reasignar' },
    'GOcelular nunca envió': { clase: 'text-violet-700 bg-violet-50 border-violet-200', hint: 'Hay stock pero GOcelular no generó el pedido de warehouse — reclamar a GOcelular' },
  }
  const e = estilos[razon]
  return (
    <span title={e.hint} className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border whitespace-nowrap ${e.clase}`}>
      {razon === 'SIN MOTIVO' ? '⚠ ' : ''}{razon}
    </span>
  )
}

// Mismo semáforo que Demoras de entrega: active rojo (en uso), locked verde,
// ready_for_use ámbar; * = dato de la réplica con más de 3 días
function TrustonicChip({ status, updatedAt }: { status: string | null; updatedAt: string | null }) {
  if (!status) return <span className="text-gray-300" title="Sin equipo asignado todavía">—</span>
  const s = status.toLowerCase()
  const cls = s === 'active' ? 'bg-red-50 text-red-700 border-red-200'
    : s === 'locked' ? 'bg-green-50 text-green-700 border-green-200'
    : s === 'ready_for_use' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'
  const emoji = s === 'active' ? '⚠️' : s === 'locked' ? '🔒' : ''
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

function EstadoOrdenChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-300">—</span>
  const esAnulada = status === 'discarded'
  const esActiva = status === 'approved' || status === 'paid' || status === 'collected'
  return (
    <span
      title={`order_status GOcuotas: ${status}`}
      className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border whitespace-nowrap ${
        esAnulada
          ? 'text-rose-700 bg-rose-50 border-rose-200'
          : esActiva
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : 'text-gray-600 bg-gray-50 border-gray-200'
      }`}
    >
      {esAnulada ? 'anulada' : esActiva ? 'activa' : status}
    </span>
  )
}

function demoraLegible(horas: number): string {
  if (horas < 72) return `${fmt1.format(horas)} h`
  return `${fmt1.format(horas / 24)} días`
}

export default function DemorasPreparacionTable({ demoras }: { demoras: FilaDemoraPreparacion[] }) {
  const [productoFiltro, setProductoFiltro] = useState('todos')

  const productos = Array.from(new Set(demoras.map(d => d.producto))).sort()
  const visibles = productoFiltro === 'todos' ? demoras : demoras.filter(d => d.producto === productoFiltro)
  const sinMotivo = visibles.filter(d => d.razon === 'SIN MOTIVO').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Demoradas en preparación</p>
          <p className="text-2xl font-bold text-gray-900">{visibles.length}</p>
          <p className="text-xs text-gray-400">confirmadas hace +{HORAS_DEMORA_PREPARACION}h hábiles sin tracking</p>
        </div>
        <div className="bg-white border border-rose-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Sin motivo aparente</p>
          <p className="text-2xl font-bold text-rose-600">{sinMotivo}</p>
          <p className="text-xs text-gray-400">las que hay que reclamar primero</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Mayor demora</p>
          <p className="text-2xl font-bold text-gray-900">{visibles.length > 0 ? demoraLegible(visibles[0].horasHabiles) : '—'}</p>
          <p className="text-xs text-gray-400">en horas hábiles (lun a vie)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-4 pt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Órdenes sin despachar ({visibles.length})</h2>
            <p className="text-xs text-gray-400 mb-2">
              Cola autolimpiante: cuando la orden recibe número de seguimiento desaparece sola — acá no hay acciones.
              Las horas cuentan solo lunes a viernes. &quot;Sin stock&quot; se evalúa con el disponible de hoy, que puede
              diferir del momento en que se trabó.
            </p>
          </div>
          <select
            value={productoFiltro}
            onChange={e => setProductoFiltro(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs"
          >
            <option value="todos">Todos los productos</option>
            {productos.map(p => (
              <option key={p} value={p}>{p.length > 60 ? p.slice(0, 60) + '…' : p}</option>
            ))}
          </select>
        </div>
        {visibles.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-400">Nada demorado en preparación. 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-1.5 px-4 font-medium">Orden</th>
                <th className="py-1.5 px-2 font-medium">Cliente</th>
                <th className="py-1.5 px-2 font-medium">Producto</th>
                <th className="py-1.5 px-2 font-medium">GOcuotas · Trustonic</th>
                <th className="py-1.5 px-2 font-medium text-right">Demora hábil</th>
                <th className="py-1.5 px-2 font-medium">Razón aparente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.map(d => (
                <tr key={d.orderNumber} className="hover:bg-gray-50">
                  <td className="py-1.5 px-4 font-mono text-xs text-gray-900">{d.orderNumber}</td>
                  <td className="py-1.5 px-2 text-gray-700">
                    {d.cliente}
                    <span className="text-[10px] text-gray-400 ml-1.5">{d.dni}</span>
                  </td>
                  <td className="py-1.5 px-2 text-gray-700 max-w-[240px] truncate" title={d.producto}>{d.producto}</td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="font-mono text-[11px] text-gray-600">{d.gocuotasOrderId ?? '—'}</span>
                      <EstadoOrdenChip status={d.gocuotasStatus} />
                      <TrustonicChip status={d.trustonicStatus} updatedAt={d.trustonicUpdatedAt} />
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-right font-medium text-gray-900">{demoraLegible(d.horasHabiles)}</td>
                  <td className="py-1.5 px-2"><RazonChip razon={d.razon} detalle={d.whPedido?.error ?? null} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
