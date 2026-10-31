'use client'

// Pestaña Siniestros: casos abiertos por denuncias de robo cargadas desde el
// formulario público (/denuncia-robo), con la mora en vivo del pedido (info
// de backoffice, nunca visible al cliente) y el flujo de estado hasta la
// resolución. La resolución positiva cierra el certificado con marca propia
// (fecha_siniestro) — por eso pide confirmación en 2 pasos, igual que
// SiniestrosTable de Envíos (Siniestros Distribución): no hay "reabrir".

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  getDenunciaUrl,
  setEstadoSiniestro,
  resolverSiniestro,
  consultarEnacom,
  type SiniestroRow,
  type EstadoSiniestro,
} from '@/lib/actions/seguros'
import type { ConsultaEnacom } from '@/lib/enacom'
import { formatearMoneda } from '@/lib/utils'

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const ESTADO_META: Record<EstadoSiniestro, { label: string; cls: string }> = {
  nuevo: { label: '🆕 Nuevo', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  en_gestion: { label: '🔧 En gestión', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  reclamado: { label: '📨 Reclamado', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  resuelto_positivo: { label: '✅ Resuelto (positivo)', cls: 'bg-green-50 text-green-700 border-green-200' },
  resuelto_negativo: { label: '❌ Resuelto (negativo)', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
}

function EstadoChip({ estado }: { estado: EstadoSiniestro }) {
  const meta = ESTADO_META[estado]
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

function MoraChip({ enMora, diasMaximos, deudaTotal, sinDato }: { enMora: boolean; diasMaximos: number; deudaTotal: number; sinDato: boolean }) {
  if (sinDato) {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-gray-50 text-gray-500 border-gray-200"
        title="No se pudo consultar la mora (falla puntual contra la réplica) — recargá la página para reintentar"
      >
        — sin dato
      </span>
    )
  }
  if (!enMora) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-green-50 text-green-700 border-green-200">
        ✅ Al día
      </span>
    )
  }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-red-50 text-red-700 border-red-200"
      title="Cobertura suspendida: el seguro no cubre siniestros con cuotas en mora. Días = atraso de la cuota más vieja; $ = deuda total impaga de la orden"
    >
      ⚠️ En mora ({diasMaximos}d · {formatearMoneda(deudaTotal)})
    </span>
  )
}

// Estado del IMEI en la base pública de ENACOM: "Bloqueado" es lo DESEADO
// para un reclamo (el cliente hizo la baja al *910 y la operadora ya la
// informó) — por eso va en verde. "Aún no figura" es esperable las primeras
// 24-48 hs después del *910: la operadora informa con demora. La consulta se
// dispara desde el cliente DESPUÉS del render (ENACOM tarda en responder
// desde Vercel — no puede bloquear la carga de la pestaña); "sin dato" deja
// el link para consultarlo a mano en el sitio de ENACOM.
function EnacomCell({ imei }: { imei: string }) {
  const [resultado, setResultado] = useState<ConsultaEnacom | null>(null)

  useEffect(() => {
    let vigente = true
    consultarEnacom(imei)
      .then((r) => { if (vigente) setResultado(r) })
      .catch(() => { if (vigente) setResultado({ estado: 'sin_dato', mensaje: null }) })
    return () => { vigente = false }
  }, [imei])

  if (resultado === null) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-gray-50 text-gray-400 border-gray-200 animate-pulse">
        Consultando ENACOM…
      </span>
    )
  }
  if (resultado.estado === 'bloqueado') {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-green-50 text-green-700 border-green-200"
        title={resultado.mensaje ?? 'El IMEI figura denunciado/bloqueado en ENACOM — la baja del cliente está confirmada por la fuente oficial'}
      >
        ✓ Bloqueado en ENACOM
      </span>
    )
  }
  if (resultado.estado === 'no_bloqueado') {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200"
        title={resultado.mensaje ?? 'El IMEI todavía no figura bloqueado en ENACOM. La operadora informa la baja con 24-48 hs de demora — esperar la confirmación antes de reclamar a la aseguradora'}
      >
        ⏳ Aún no figura
      </span>
    )
  }
  return (
    <a
      href="https://imei.enacom.gob.ar/"
      target="_blank"
      rel="noreferrer"
      className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 underline decoration-dotted"
      title="No se pudo consultar ENACOM automáticamente — click para consultarlo a mano en imei.enacom.gob.ar (copiá el IMEI de la fila)"
    >
      — sin dato · ver en ENACOM
    </a>
  )
}

// Link "Ver denuncia": la URL firmada se pide a demanda (nunca se embebe en
// el HTML de la página) y vence en 1 hora — mismo patrón que urlCv de
// reclutamiento, pero generado por click en vez de precargado por fila.
function VerDenuncia({ archivoPath }: { archivoPath: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const abrir = () => {
    setError(null)
    startTransition(async () => {
      const url = await getDenunciaUrl(archivoPath)
      if (!url) {
        setError('No se pudo generar el link.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={abrir}
        disabled={pending}
        className="text-xs text-magenta-600 hover:text-magenta-800 underline disabled:opacity-50"
      >
        {pending ? 'Generando…' : 'Ver denuncia'}
      </button>
      {error && <div className="text-[10px] text-red-600">{error}</div>}
    </div>
  )
}

// Avance nuevo→en_gestion→reclamado: reversible en los hechos (es solo
// seguimiento de gestión, no toca el certificado), así que va sin
// confirmación — a diferencia de la resolución final.
function AvanceEstado({ id, estado }: { id: string; estado: EstadoSiniestro }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const avanzar = (siguiente: 'en_gestion' | 'reclamado') => {
    setError(null)
    startTransition(async () => {
      try {
        await setEstadoSiniestro(id, siguiente)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado')
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      {estado === 'nuevo' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => avanzar('en_gestion')}
          className="px-2 py-0.5 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 whitespace-nowrap disabled:opacity-50"
        >
          {pending ? '…' : '→ En gestión'}
        </button>
      )}
      {estado === 'en_gestion' && (
        <button
          type="button"
          disabled={pending}
          onClick={() => avanzar('reclamado')}
          className="px-2 py-0.5 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 whitespace-nowrap disabled:opacity-50"
        >
          {pending ? '…' : '→ Reclamado'}
        </button>
      )}
      {error && <span className="text-[10px] text-red-600 max-w-[140px]">{error}</span>}
    </div>
  )
}

// Resolución final, con confirmación en 2 pasos (patrón de Siniestros
// Distribución): elegir resultado, completar el form (fechaRobo obligatoria
// si es positivo — el voucher al cliente lo gestiona Yami a mano, fuera de
// la app) y confirmar. No hay "reabrir": un siniestro resuelto positivo ya
// dejó marca en el certificado.
function ResolverPanel({ id }: { id: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [resultado, setResultado] = useState<'positivo' | 'negativo' | null>(null)
  const [fechaRobo, setFechaRobo] = useState('')
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const reset = () => {
    setAbierto(false)
    setResultado(null)
    setFechaRobo('')
    setMonto('')
    setNota('')
    setConfirmando(false)
    setError(null)
  }

  const confirmar = () => {
    if (!resultado) return
    if (resultado === 'positivo' && !fechaRobo) {
      setError('Falta la fecha del robo.')
      setConfirmando(false)
      return
    }
    let montoReconocido: number | undefined
    if (monto) {
      montoReconocido = Number(monto)
      if (Number.isNaN(montoReconocido)) {
        setError('El monto reconocido no es un número válido.')
        setConfirmando(false)
        return
      }
    }
    setError(null)
    startTransition(async () => {
      try {
        await resolverSiniestro(id, resultado, {
          fechaRobo: fechaRobo || undefined,
          montoReconocido,
          nota: nota || undefined,
        })
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado')
        setConfirmando(false)
      }
    })
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="px-2 py-0.5 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 whitespace-nowrap"
      >
        Resolver
      </button>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg p-2 bg-gray-50 w-64 space-y-2">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => { setResultado('positivo'); setError(null) }}
          className={`flex-1 px-2 py-1 rounded text-xs font-medium border ${
            resultado === 'positivo' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'
          }`}
        >
          ✅ Positivo
        </button>
        <button
          type="button"
          onClick={() => { setResultado('negativo'); setError(null) }}
          className={`flex-1 px-2 py-1 rounded text-xs font-medium border ${
            resultado === 'negativo' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300'
          }`}
        >
          ❌ Negativo
        </button>
      </div>

      {resultado === 'positivo' && (
        <div className="space-y-1">
          <label className="block text-[11px] text-gray-500">Fecha del robo *</label>
          <input
            type="date"
            value={fechaRobo}
            onChange={(e) => setFechaRobo(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          />
          <label className="block text-[11px] text-gray-500">Monto reconocido (opcional)</label>
          <input
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="$"
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          />
        </div>
      )}

      {resultado && (
        <div className="space-y-1">
          <label className="block text-[11px] text-gray-500">Nota (opcional)</label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          />
        </div>
      )}

      {error && <p className="text-[10px] text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        {confirmando ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={confirmar}
              className="px-2 py-1 rounded text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? '…' : '¿Confirmar cierre?'}
            </button>
            {!pending && (
              <button type="button" onClick={() => setConfirmando(false)} className="text-xs text-gray-400 hover:text-gray-600">
                Cancelar
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={!resultado}
              onClick={() => setConfirmando(true)}
              className="px-2 py-1 rounded text-xs font-medium text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-40"
            >
              Guardar
            </button>
            <button type="button" onClick={reset} className="text-xs text-gray-400 hover:text-gray-600">
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function FilaCaso({ s, resuelta }: { s: SiniestroRow; resuelta: boolean }) {
  return (
    <tr className="hover:bg-gray-50 align-top">
      <td className="px-4 py-3 text-gray-900">
        {s.cliente || '—'}
        <div className="text-xs text-gray-500">DNI {s.dni ?? s.dniIngresado} · Cert. N° {s.numero ?? '—'}</div>
        <div className="text-xs text-gray-400 whitespace-nowrap" title="N° de pedido GOcelular · N° de orden GOcuotas">
          {s.pedidoNumero ?? '—'} · GOcuotas {s.gocuotasOrderId || '—'}
        </div>
      </td>
      <td className="px-4 py-3 text-gray-600 max-w-[180px]">
        <div className="truncate" title={s.articulo}>{s.articulo || '—'}</div>
        <div className="font-mono text-xs text-gray-400">{s.imei || '—'}</div>
      </td>
      <td className="px-4 py-3 text-right text-gray-900 tabular-nums whitespace-nowrap">
        {s.sumaAsegurada !== null ? formatearMoneda(s.sumaAsegurada) : '—'}
      </td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
        {fecha(s.inicioVig)} – {fecha(s.finVig)}
      </td>
      {!resuelta && (
        <td className="px-4 py-3"><MoraChip enMora={s.enMora} diasMaximos={s.diasMaximos} deudaTotal={s.deudaTotal} sinDato={s.moraSinDato} /></td>
      )}
      {!resuelta && (
        <td className="px-4 py-3">
          {s.imei ? <EnacomCell imei={s.imei} /> : null}
          <div className="text-xs text-gray-500 mt-1 font-mono" title="N° de gestión de la baja del IMEI (*910) declarado por el cliente">
            {s.bajaImeiGestion ?? 'sin n° de gestión'}
          </div>
        </td>
      )}
      <td className="px-4 py-3">
        <VerDenuncia archivoPath={s.archivoPath} />
        {resuelta && s.bajaImeiGestion && (
          <div className="text-xs text-gray-400 font-mono mt-0.5" title="N° de gestión de la baja del IMEI (*910)">
            baja: {s.bajaImeiGestion}
          </div>
        )}
      </td>
      {resuelta ? (
        <>
          <td className="px-4 py-3"><EstadoChip estado={s.estado} /></td>
          <td className="px-4 py-3 text-right text-gray-900 tabular-nums whitespace-nowrap">
            {s.montoReconocido !== null ? formatearMoneda(s.montoReconocido) : '—'}
          </td>
          <td className="px-4 py-3 text-gray-600 max-w-[200px]">
            <div className="truncate" title={s.nota ?? undefined}>{s.nota || '—'}</div>
            <div className="text-xs text-gray-400">{fecha(s.resueltoAt)}</div>
          </td>
        </>
      ) : (
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            <EstadoChip estado={s.estado} />
            {(s.estado === 'nuevo' || s.estado === 'en_gestion') && <AvanceEstado id={s.id} estado={s.estado} />}
            {s.estado === 'reclamado' && <ResolverPanel id={s.id} />}
          </div>
        </td>
      )}
    </tr>
  )
}

export default function SiniestrosTab({ siniestros }: { siniestros: SiniestroRow[] }) {
  const pendientes = siniestros.filter((s) => s.estado !== 'resuelto_positivo' && s.estado !== 'resuelto_negativo')
  const resueltos = siniestros.filter((s) => s.estado === 'resuelto_positivo' || s.estado === 'resuelto_negativo')

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Denuncias de robo cargadas por el cliente desde el formulario público. Seguí el caso (nuevo → en gestión →
        reclamado) y cerralo: positivo marca el certificado como siniestrado (deja de devengar prima y aparece con
        fecha de siniestro en el export del broker); negativo solo cierra la denuncia, el certificado sigue vigente.
        El voucher al cliente lo entrega Yami a mano, fuera de la app. La mora es información de backoffice — nunca
        se muestra al cliente. Reclamar a la aseguradora recién cuando ENACOM confirme el bloqueo del IMEI (la
        operadora lo informa con 24-48 hs de demora después del *910).
      </p>

      {pendientes.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-sm text-green-700 font-medium">
            {siniestros.length === 0 ? '✅ Sin denuncias de robo cargadas.' : '✅ Sin casos pendientes: todos los siniestros están resueltos.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Artículo / IMEI</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Suma asegurada</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vigencia</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" title="Mora en vivo del pedido — cobertura suspendida si hay cuotas vencidas">Mora</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" title="Estado del IMEI en la base pública de ENACOM + n° de gestión de la baja declarado por el cliente">Baja IMEI / ENACOM</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Denuncia</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado / acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendientes.map((s) => <FilaCaso key={s.id} s={s} resuelta={false} />)}
            </tbody>
          </table>
        </div>
      )}

      {resueltos.length > 0 && (
        <details className="border border-gray-200 rounded-lg">
          <summary className="cursor-pointer px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 select-none">
            ✓ Resueltos ({resueltos.length})
          </summary>
          <div className="px-3 pb-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Artículo / IMEI</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Suma asegurada</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Vigencia</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Denuncia</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Resultado</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Monto reconocido</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nota / fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resueltos.map((s) => <FilaCaso key={s.id} s={s} resuelta={true} />)}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
