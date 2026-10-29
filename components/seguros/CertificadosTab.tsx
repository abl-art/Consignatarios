'use client'

// Pestaña Certificados: switch maestro del seguro (activar sin confirmación,
// desactivar con confirmación en 2 pasos — mismo patrón que SuperAdminToggle
// en /usuarios/[id]), export a Excel del broker, tarjetas resumen por estado
// y la tabla de certificados con los pendientes de emisión arriba (banda ámbar).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setSeguroActivo, type CertificadoRow, type SegurosConfig } from '@/lib/actions/seguros'
import { formatearMoneda } from '@/lib/utils'
import type { ResumenPrimaActual } from '@/lib/seguros-informes'

type Estado = 'vigente' | 'anulado' | 'siniestrado' | 'pendiente'

// Prioridad de derivación (según spec de Task 7): pendiente > siniestrado > anulado > vigente
function estadoDe(c: CertificadoRow): Estado {
  if (c.estado === 'pendiente') return 'pendiente'
  if (c.fechaSiniestro) return 'siniestrado'
  if (c.fechaAnula) return 'anulado'
  return 'vigente'
}

const ESTADO_META: Record<Estado, { label: string; cls: string }> = {
  vigente: { label: 'Vigente', cls: 'bg-green-50 text-green-700 border-green-200' },
  anulado: { label: 'Anulado', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  siniestrado: { label: 'Siniestrado', cls: 'bg-red-50 text-red-700 border-red-200' },
  pendiente: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function EstadoChip({ estado }: { estado: Estado }) {
  const meta = ESTADO_META[estado]
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

interface Props {
  certificados: CertificadoRow[]
  config: SegurosConfig
  facturas: Record<string, { numero: string; fecha: string }>
  operar: boolean
  primaActual: ResumenPrimaActual
  siniestralidad: { emitidos: number; siniestrados: number; tasaPct: number }
}

export default function CertificadosTab({ certificados, config, facturas, operar, primaActual, siniestralidad }: Props) {
  const router = useRouter()
  const [activo, setActivo] = useState(config.activo)
  const [confirmandoBaja, setConfirmandoBaja] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function activar() {
    setError(null)
    startTransition(async () => {
      try {
        await setSeguroActivo(true)
        setActivo(true)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado')
      }
    })
  }

  function confirmarDesactivar() {
    setError(null)
    startTransition(async () => {
      try {
        await setSeguroActivo(false)
        setActivo(false)
        setConfirmandoBaja(false)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error inesperado')
        setConfirmandoBaja(false)
      }
    })
  }

  const conEstado = certificados.map(c => ({ ...c, _estado: estadoDe(c) }))
  const vigentes = conEstado.filter(c => c._estado === 'vigente')
  const anulados = conEstado.filter(c => c._estado === 'anulado')
  const siniestrados = conEstado.filter(c => c._estado === 'siniestrado')
  const pendientes = conEstado.filter(c => c._estado === 'pendiente')
  const resto = conEstado.filter(c => c._estado !== 'pendiente')
  const filas = [...pendientes, ...resto]

  return (
    <div className="space-y-6">
      {/* Switch maestro */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Seguro por robo {activo ? 'activo' : 'inactivo'}
          </p>
          <p className="text-xs text-gray-500 max-w-md">
            {activo
              ? `Activado el ${config.activadoAt ? fecha(config.activadoAt) : '—'}. Todas las ventas vinculadas desde esa fecha entran al seguro.`
              : 'Al activar, todas las ventas vinculadas desde este momento quedan cubiertas por el seguro.'}
          </p>
        </div>

        {!operar ? (
          <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {activo ? 'Activo' : 'Inactivo'}
          </span>
        ) : activo ? (
          confirmandoBaja ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={confirmarDesactivar}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
              >
                {pending ? '…' : '¿Confirmar desactivación?'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoBaja(false)}
                disabled={pending}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmandoBaja(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 whitespace-nowrap"
            >
              Desactivar
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={activar}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
          >
            {pending ? '…' : 'Activar'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Export */}
      <div className="flex justify-end">
        <a
          href="/api/seguros/export"
          className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors inline-flex items-center gap-2"
        >
          Descargar Excel broker
        </a>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Vigentes</p>
          <p className="text-2xl font-bold text-green-700">{vigentes.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Anulados</p>
          <p className="text-2xl font-bold text-gray-600">{anulados.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Siniestrados</p>
          <p className="text-2xl font-bold text-red-700">{siniestrados.length}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Pendientes de emisión</p>
          <p className="text-2xl font-bold text-amber-700">{pendientes.length}</p>
        </div>
      </div>

      {/* Prima del mes y siniestralidad */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Prima mensual (sin IVA)</p>
          <p className="text-xl font-bold text-gray-900">{formatearMoneda(primaActual.primaMesSinIva)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {primaActual.pctSinIva}% de la suma asegurada (contratado: {primaActual.pctConIva}% IVA inc.)
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Tasa de siniestralidad</p>
          <p className={`text-xl font-bold ${siniestralidad.tasaPct >= 5 ? 'text-red-700' : siniestralidad.tasaPct >= 2 ? 'text-amber-600' : 'text-green-700'}`}>
            {siniestralidad.tasaPct.toFixed(2)}%
          </p>
          <p className="text-xs text-gray-400 mt-1">{siniestralidad.siniestrados} siniestrados / {siniestralidad.emitidos} emitidos</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">N°</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Cliente</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">DNI</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Artículo</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">IMEI</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Suma</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Inicio vig.</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Fin vig.</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Estado</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">N° factura</th>
            </tr>
          </thead>
          <tbody>
            {pendientes.length > 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-1.5 bg-amber-50 text-amber-800 text-xs font-medium border-b border-amber-100">
                  Pendientes de emisión — sin costo de lista — revisar
                </td>
              </tr>
            )}
            {filas.map((c) => {
              const factura = facturas[c.gocuotasOrderId]
              return (
                <tr key={c.id} className={`border-b border-gray-50 ${c._estado === 'pendiente' ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-3 py-2 text-xs text-gray-700">{c.numero ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-900">{c.cliente ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{c.dni ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{c.articulo}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 font-mono">{c.imei}</td>
                  <td className="px-3 py-2 text-xs text-right font-mono text-gray-900">
                    {c.sumaAsegurada !== null ? formatearMoneda(c.sumaAsegurada) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{fecha(c.inicioVig)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{fecha(c.finVig)}</td>
                  <td className="px-3 py-2"><EstadoChip estado={c._estado} /></td>
                  <td className="px-3 py-2 text-xs text-gray-600">{factura ? factura.numero : '—'}</td>
                </tr>
              )
            })}
            {filas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-400">
                  Sin certificados todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
