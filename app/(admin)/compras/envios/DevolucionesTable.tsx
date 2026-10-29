'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FilaDevolucion, SeguimientoAndreani } from '@/lib/actions/devoluciones'
import { setRecibidoWhGo, setDevolucionResuelta } from '@/lib/actions/devoluciones'
import { formatearDuracion, separarResueltos } from '@/lib/devoluciones'
import { etiquetaDevolucion, claseDevolucion } from '@/lib/estados-andreani'
import BotonAnularOrden from './BotonAnularOrden'

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Color del estado actual según dónde está en el circuito.
function colorEstado(estado: string | null): string {
  if (!estado) return 'bg-gray-100 text-gray-500 border-gray-200'
  const e = estado.toLowerCase()
  if (e.includes('entregado') || e.includes('devuelto') || e.includes('retirado')) return 'bg-green-50 text-green-700 border-green-200'
  if (e.includes('no retirado') || e.includes('rezago')) return 'bg-red-50 text-red-700 border-red-200'
  if (e.includes('pendiente')) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-blue-50 text-blue-700 border-blue-200'
}

const BANDERAS: Record<string, { label: string; title: string }> = {
  stock_sin_retorno: { label: '⚠️ Stock sin retorno', title: 'El equipo se entregó al cliente pero ya figura DISPONIBLE en stock — riesgo de doble venta si no volvió físicamente.' },
  trustonic_activo_anulada: { label: '⚠️ Trustonic activo', title: 'La orden está anulada pero el equipo sigue ACTIVE en Trustonic — en manos del cliente sin bloquear.' },
  devolucion_sin_movimiento: { label: '⚠️ Sin movimiento', title: 'La etiqueta de devolución se generó pero Andreani no registra ningún evento — el retiro nunca arrancó.' },
}

// Seguimiento de un tracking: estado actual + secuencia de estados con su duración,
// y link al seguimiento público de Andreani para verificar.
function Seguimiento({ s }: { s: SeguimientoAndreani }) {
  if (!s.tracking) return <span className="text-gray-400 text-xs">— sin envío</span>
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[11px] font-medium ${colorEstado(s.estadoActual)}`}>
          {s.consultado ? (s.estadoActual ?? 'sin datos') : 'no consultado'}
        </span>
        <a
          href={`https://www.andreani.com/envio/${s.tracking}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-blue-600 hover:underline font-mono"
          title="Ver seguimiento oficial en Andreani"
        >
          {s.tracking} ↗
        </a>
      </div>
      {s.tramos.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-gray-600">
          {s.tramos.map((t, i) => (
            <span key={i} className="whitespace-nowrap">
              <span className={t.enCurso ? 'font-semibold text-gray-900' : ''}>{t.estado}</span>
              <span className="text-gray-400"> {formatearDuracion(t.horas)}{t.enCurso ? '…' : ''}</span>
              {i < s.tramos.length - 1 && <span className="text-gray-300"> →</span>}
            </span>
          ))}
        </div>
      )}
      {s.totalHoras > 0 && (
        <div className="text-[10px] text-gray-400">total {formatearDuracion(s.totalHoras)}</div>
      )}
    </div>
  )
}

// Tilde manual (devoluciones_seguimiento en Supabase, clave = tracking del
// retorno): el equipo entró físicamente al depósito de GOcuotas.
function RecibidoWhCheck({ tracking, recibido }: { tracking: string | null; recibido: boolean }) {
  const [checked, setChecked] = useState(recibido)
  const [pending, startTransition] = useTransition()
  if (!tracking) return <span className="text-gray-400" title="Sin tracking de devolución no se puede guardar el tilde">—</span>
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      onChange={(e) => {
        const valor = e.target.checked
        setChecked(valor)
        startTransition(async () => {
          const res = await setRecibidoWhGo(tracking, valor)
          if (res.error) setChecked(!valor)
        })
      }}
      className="w-4 h-4 accent-green-600 cursor-pointer"
      title="Tildar cuando el equipo se recibió físicamente en el depósito de GOcuotas"
    />
  )
}

// Estado reportado por Pedro (webhook de GOcelular) para la orden: segunda
// fuente de control, independiente de lo que diga Andreani. Nada se muestra
// si no hay dato.
function PedroChip({ estado }: { estado: string | null }) {
  const etiqueta = etiquetaDevolucion(estado)
  if (!etiqueta) return null
  const clase = claseDevolucion(estado)
  const cls =
    clase === 'ok' ? 'bg-green-50 text-green-700 border-green-200'
    : clase === 'mal' ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-full border text-[11px] font-medium ${cls}`}
      title="Estado reportado por Pedro (GOcelular) — segunda fuente de control; con retiro realizado / devolución recibida se habilita Anular orden"
    >
      {clase === 'mal' ? '⚠️ ' : ''}{etiqueta}
    </span>
  )
}

// Devolución disparada desde el 360 por el webhook: chip de modalidad + link a
// la etiqueta PDF (en sucursal se la manda al cliente para pegar en el paquete).
function PedidaWebhookChip({ orderNumber, pedida }: { orderNumber: string; pedida: { modalidad: string; estado: string | null } | null }) {
  if (!pedida) return null
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block px-1.5 py-0.5 rounded-full border text-[11px] font-medium bg-indigo-50 text-indigo-700 border-indigo-200"
        title="Devolución pedida desde el 360 por el webhook de GOcelular"
      >
        360 · {pedida.modalidad}
      </span>
      <a
        href={`/compras/envios/etiqueta-devolucion?order=${encodeURIComponent(orderNumber)}`}
        target="_blank"
        rel="noreferrer"
        className="text-[11px] text-indigo-700 hover:underline whitespace-nowrap"
        title="Descargar la etiqueta PDF de la devolución (para mandarle al cliente)"
      >
        🏷 etiqueta
      </a>
    </span>
  )
}

// Resolver con confirmación en dos pasos (mismo patrón que Rescates): ninguna
// devolución se archiva sola por su estado de Andreani — Yami la cierra a
// mano cuando el equipo apareció en el depósito (o el caso quedó gestionado
// por otra vía). En la lista de resueltos el mismo botón reabre sin
// confirmación (acción inocua). Clave = tracking del envío de retorno.
function AccionResuelto({ tracking, resueltoAt }: { tracking: string | null; resueltoAt: string | null }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!tracking) return <span className="text-gray-400" title="Sin tracking de devolución no se puede guardar el estado">—</span>

  const ejecutar = (resuelto: boolean) => {
    startTransition(async () => {
      const res = await setDevolucionResuelta(tracking, resuelto)
      if (res.error) {
        setError(res.error)
        setConfirmando(false)
      } else {
        router.refresh()
      }
    })
  }

  if (resueltoAt) {
    return (
      <button
        disabled={enviando}
        onClick={() => ejecutar(false)}
        className="px-2 py-0.5 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 whitespace-nowrap disabled:opacity-40"
        title={`Resuelto el ${fecha(resueltoAt)} — volver a gestión`}
      >
        {enviando ? '…' : '↩ Reabrir'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {confirmando ? (
        <>
          <button
            disabled={enviando}
            onClick={() => ejecutar(true)}
            className="px-2 py-0.5 rounded text-xs font-bold text-white whitespace-nowrap bg-green-600 hover:bg-green-700 disabled:opacity-50"
            title="Confirmar: el equipo apareció en el depósito (o el caso quedó gestionado) — pasa a la lista de resueltos"
          >
            {enviando ? '…' : '¿Resolver?'}
          </button>
          {!enviando && (
            <button onClick={() => setConfirmando(false)} className="text-xs text-gray-400 hover:text-gray-600 px-0.5" title="Cancelar">
              ✕
            </button>
          )}
        </>
      ) : (
        <button
          onClick={() => { setConfirmando(true); setError(null) }}
          className="px-2 py-0.5 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 whitespace-nowrap"
          title="Marcar como resuelto: el equipo apareció en el depósito (o el caso quedó gestionado por otra vía)"
        >
          ✓ Resolver
        </button>
      )}
      {error && <span className="text-[10px] text-red-600 max-w-[140px]">{error}</span>}
    </div>
  )
}

export default function DevolucionesTable({ devoluciones }: { devoluciones: FilaDevolucion[] }) {
  const { pendientes, resueltas, resumen } = useMemo(() => {
    const { pendientes, resueltas } = separarResueltos(devoluciones)
    // Tiempo promedio punta a punta de las devoluciones ya cerradas a mano (medición honesta)
    const conTotal = resueltas.filter(d => d.devolucion.totalHoras > 0)
    const promedioHoras = conTotal.length > 0
      ? conTotal.reduce((a, d) => a + d.devolucion.totalHoras, 0) / conTotal.length
      : 0
    return {
      pendientes,
      resueltas,
      resumen: {
        pendientes: pendientes.length,
        conAlerta: devoluciones.filter(d => d.banderas.length > 0).length,
        sinMovimiento: devoluciones.filter(d => d.banderas.includes('devolucion_sin_movimiento')).length,
        promedioHoras,
      },
    }
  }, [devoluciones])

  if (devoluciones.length === 0) {
    return <p className="text-sm text-gray-500">No hay devoluciones registradas.</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tarjeta label="Pendientes / gestión" valor={String(resumen.pendientes)} />
        <Tarjeta label="Con alerta" valor={String(resumen.conAlerta)} color={resumen.conAlerta > 0 ? 'text-red-600' : undefined} />
        <Tarjeta label="Sin movimiento" valor={String(resumen.sinMovimiento)} color={resumen.sinMovimiento > 0 ? 'text-amber-600' : undefined} />
        <Tarjeta label="Tiempo prom. devolución" valor={resumen.promedioHoras > 0 ? formatearDuracion(resumen.promedioHoras) : '—'} />
      </div>

      <p className="text-xs text-gray-500">
        Los dos seguimientos se consultan en vivo contra la API pública de Andreani. El tiempo de cada estado sale de las fechas reales de Andreani.
        El estado de Pedro es una segunda fuente de control. Ninguna devolución se archiva sola: marcá «✓ Resolver» recién cuando el caso quedó cerrado.
      </p>

      {pendientes.length > 0 ? (
        <TablaDevoluciones filas={pendientes} />
      ) : (
        <p className="text-sm text-green-700">✓ No hay devoluciones pendientes de gestión.</p>
      )}

      {resueltas.length > 0 && (
        <details className="border border-gray-200 rounded-lg">
          <summary className="cursor-pointer px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 select-none">
            ✓ Resueltos ({resueltas.length})
          </summary>
          <div className="px-3 pb-3">
            <TablaDevoluciones filas={resueltas} />
          </div>
        </details>
      )}
    </div>
  )
}

function TablaDevoluciones({ filas }: { filas: FilaDevolucion[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-3 font-medium">Orden / Cliente</th>
            <th className="py-2 pr-3 font-medium">Producto / IMEI</th>
            <th className="py-2 pr-3 font-medium">🚚 Entrega</th>
            <th className="py-2 pr-3 font-medium">↩️ Devolución</th>
            <th className="py-2 pr-3 font-medium" title="Estado reportado por Pedro (GOcelular) — segunda fuente de control">Pedro</th>
            <th className="py-2 pr-3 font-medium text-center" title="El equipo se recibió físicamente en el depósito de GOcuotas">Recibido WH GO</th>
            <th className="py-2 pr-3 font-medium">Alertas</th>
            <th className="py-2 pr-3 font-medium" title="Marcar como resuelto cuando el caso quedó cerrado">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((d, i) => (
            <tr key={i} className="border-b align-top hover:bg-gray-50">
              <td className="py-2 pr-3">
                <div className="font-mono text-gray-900">{d.orderNumber}</div>
                {d.gocuotasOrderId && (
                  <div className="text-[11px] text-gray-500">GO #{d.gocuotasOrderId}{d.ordenAnulada && <span className="ml-1 text-red-600 font-medium">anulada</span>}</div>
                )}
                <div className="text-[11px] text-gray-600">{d.cliente}</div>
                {(d.ciudad || d.provincia) && <div className="text-[10px] text-gray-400">{[d.ciudad, d.provincia].filter(Boolean).join(', ')}</div>}
                <div className="text-[10px] text-gray-400">dev. {fecha(d.returnCreadoAt)}</div>
              </td>
              <td className="py-2 pr-3">
                <div className="text-gray-800">{d.producto}</div>
                {d.imei && <div className="font-mono text-[10px] text-gray-400">{d.imei}</div>}
                {d.inventarioStatus && <div className="text-[10px] text-gray-400">stock: {d.inventarioStatus}</div>}
              </td>
              <td className="py-2 pr-3 min-w-[220px]"><Seguimiento s={d.entrega} /></td>
              <td className="py-2 pr-3 min-w-[220px]"><Seguimiento s={d.devolucion} /></td>
              <td className="py-2 pr-3">
                <div className="space-y-1">
                  <PedroChip estado={d.pedroEstado} />
                  <PedidaWebhookChip orderNumber={d.orderNumber} pedida={d.pedidaWebhook} />
                </div>
              </td>
              <td className="py-2 pr-3 text-center"><RecibidoWhCheck tracking={d.devolucion.tracking} recibido={d.recibidoWhGo} /></td>
              <td className="py-2 pr-3">
                {d.banderas.length === 0 && !d.banderaPedro ? (
                  <span className="text-green-600 text-[11px]">✓ ok</span>
                ) : (
                  <div className="space-y-1">
                    {d.banderas.map(b => (
                      <span
                        key={b}
                        className="block text-[11px] text-red-700 cursor-help"
                        title={BANDERAS[b]?.title ?? b}
                      >
                        {BANDERAS[b]?.label ?? b}
                      </span>
                    ))}
                    {d.banderaPedro && (
                      <span
                        className="block text-[11px] text-red-700 cursor-help"
                        title="Discrepancia entre el estado de Andreani y el reportado por Pedro"
                      >
                        ⚠️ {d.banderaPedro}
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="py-2 pr-3">
                <div className="space-y-1">
                  <AccionResuelto tracking={d.devolucion.tracking} resueltoAt={d.resueltoAt} />
                  {!d.ordenAnulada && (
                    <BotonAnularOrden
                      gocuotasOrderId={d.gocuotasOrderId}
                      gocuotasStatus={d.gocuotasStatus}
                      orderNumber={d.orderNumber}
                      devolucionEstado={d.pedroEstado}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Tarjeta({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{valor}</div>
    </div>
  )
}
