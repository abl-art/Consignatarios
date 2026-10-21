'use client'

// Demoras de PREPARACIÓN: cola autolimpiante y sin acciones — las órdenes
// entran a las 48h hábiles sin tracking y desaparecen solas cuando GOcelular
// genera el número de seguimiento. La razón dice a quién reclamar.

import type { DemoraPreparacion, RazonDemoraPreparacion } from '@/lib/demoras-preparacion'
import { HORAS_DEMORA_PREPARACION } from '@/lib/demoras-preparacion'

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

function demoraLegible(horas: number): string {
  if (horas < 72) return `${fmt1.format(horas)} h`
  return `${fmt1.format(horas / 24)} días`
}

export default function DemorasPreparacionTable({ demoras }: { demoras: DemoraPreparacion[] }) {
  const sinMotivo = demoras.filter(d => d.razon === 'SIN MOTIVO').length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Demoradas en preparación</p>
          <p className="text-2xl font-bold text-gray-900">{demoras.length}</p>
          <p className="text-xs text-gray-400">confirmadas hace +{HORAS_DEMORA_PREPARACION}h hábiles sin tracking</p>
        </div>
        <div className="bg-white border border-rose-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Sin motivo aparente</p>
          <p className="text-2xl font-bold text-rose-600">{sinMotivo}</p>
          <p className="text-xs text-gray-400">las que hay que reclamar primero</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Mayor demora</p>
          <p className="text-2xl font-bold text-gray-900">{demoras.length > 0 ? demoraLegible(demoras[0].horasHabiles) : '—'}</p>
          <p className="text-xs text-gray-400">en horas hábiles (lun a vie)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-4 pt-4">
          <h2 className="text-sm font-semibold text-gray-900">Órdenes sin despachar ({demoras.length})</h2>
          <p className="text-xs text-gray-400 mb-2">
            Cola autolimpiante: cuando la orden recibe número de seguimiento desaparece sola — acá no hay acciones.
            Las horas cuentan solo lunes a viernes. &quot;Sin stock&quot; se evalúa con el disponible de hoy, que puede
            diferir del momento en que se trabó.
          </p>
        </div>
        {demoras.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-gray-400">Nada demorado en preparación. 🎉</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-1.5 px-4 font-medium">Orden</th>
                <th className="py-1.5 px-2 font-medium">Cliente</th>
                <th className="py-1.5 px-2 font-medium">Producto</th>
                <th className="py-1.5 px-2 font-medium text-right">Demora hábil</th>
                <th className="py-1.5 px-2 font-medium">Razón aparente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {demoras.map(d => (
                <tr key={d.orderNumber} className="hover:bg-gray-50">
                  <td className="py-1.5 px-4 font-mono text-xs text-gray-900">{d.orderNumber}</td>
                  <td className="py-1.5 px-2 text-gray-700">
                    {d.cliente}
                    <span className="text-[10px] text-gray-400 ml-1.5">{d.dni}</span>
                  </td>
                  <td className="py-1.5 px-2 text-gray-700 max-w-[260px] truncate" title={d.producto}>{d.producto}</td>
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
