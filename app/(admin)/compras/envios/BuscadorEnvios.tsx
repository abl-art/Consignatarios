'use client'

// Buscador transversal de la página: con un DNI, tracking de Andreani, orden
// o IMEI muestra en qué pestañas aparece y deja accionar desde acá mismo con
// las mismas server actions de cada tabla (confirmación en 2 pasos, patrón
// DemorasTable). El click en la tarjeta activa la pestaña (?tab=, lo maneja
// EnviosTabs).

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { buscarEnvios, LABEL_TAB, type AccionBusqueda, type FuentesBusqueda, type ResultadoBusqueda } from '@/lib/buscador-envios'
import { confirmarArrepentimiento, descartarArrepentimiento } from '@/lib/actions/arrepentimientos'
import { cargarRescate } from '@/lib/actions/rescates'
import { cargarSiniestro, setNotaCredito } from '@/lib/actions/siniestros'
import { descartarDemora } from '@/lib/actions/demoras'
import { setEstadoSiniestroStock } from '@/lib/actions/siniestros-stock'
import { MOTIVOS_DESCARTE_ARREPENTIMIENTO } from '@/lib/arrepentimientos'

// Botones por tipo de acción; key identifica la variante dentro de la tarjeta
type Boton = { key: string; label: string; confirm: string; title: string; cls: string }

const BOTONES: Record<AccionBusqueda['tipo'], Boton[]> = {
  arrepentimiento: [
    { key: 'confirmar', label: 'Confirmar', confirm: '¿Confirmar rescate?', title: 'Crear el rescate en Andreani (pestaña Rescates)', cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { key: 'descartar', label: 'Descartar', confirm: '¿Descartar?', title: 'Descartar la solicitud con motivo', cls: 'bg-gray-100 text-gray-600 hover:bg-gray-200' },
  ],
  demora: [
    { key: 'rescate', label: 'Rescate', confirm: '¿Pedir rescate?', title: 'Pedir RESCATE con motivo No Entregado (pasa a Rescates)', cls: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
    { key: 'siniestro', label: 'Siniestro', confirm: '¿Cargar siniestro?', title: 'Cargar como SINIESTRO (pasa a Siniestros Distribución)', cls: 'bg-red-50 text-red-700 hover:bg-red-100' },
    { key: 'descartar', label: 'Descartar', confirm: '¿Descartar?', title: 'Verifiqué en Andreani que se entregó (traces viejos)', cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
  ],
  'siniestro-nc': [
    { key: 'nc', label: 'NC emitida', confirm: '¿Marcar NC?', title: 'Tildar/destildar nota de crédito emitida', cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
  ],
  'siniestro-wh': [
    { key: 'resolver', label: 'Resolver', confirm: '¿Resolver?', title: 'Marcar el siniestro de depósito como resuelto', cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  ],
}

function ejecutarAccion(accion: AccionBusqueda, key: string, motivo: string): Promise<{ ok?: true; error?: string }> {
  switch (accion.tipo) {
    case 'arrepentimiento':
      return key === 'confirmar' ? confirmarArrepentimiento(accion.id) : descartarArrepentimiento(accion.id, motivo)
    case 'demora':
      return key === 'rescate' ? cargarRescate(accion.tracking, 'No Entregado')
        : key === 'siniestro' ? cargarSiniestro(accion.tracking)
        : descartarDemora(accion.tracking, 'Verificado entregado en Andreani')
    case 'siniestro-nc':
      return setNotaCredito(accion.tracking, !accion.notaCredito)
    case 'siniestro-wh':
      return setEstadoSiniestroStock(accion.id, true)
  }
}

function Tarjeta({ r, idx, onIr }: { r: ResultadoBusqueda; idx: number; onIr: (tab: string) => void }) {
  const router = useRouter()
  const [armado, setArmado] = useState<string | null>(null)
  const [motivo, setMotivo] = useState<string>(MOTIVOS_DESCARTE_ARREPENTIMIENTO[0])
  const [error, setError] = useState<string | null>(null)
  const [enviando, startTransition] = useTransition()

  const clickear = (key: string) => {
    if (armado !== key) {
      setArmado(key)
      setError(null)
      return
    }
    startTransition(async () => {
      const res = await ejecutarAccion(r.accion!, key, motivo)
      if (res.error) {
        setError(res.error)
        setArmado(null)
      } else {
        setArmado(null)
        router.refresh()
      }
    })
  }

  const botones = r.accion ? BOTONES[r.accion.tipo] : []
  const confirmarDeshabilitado = r.accion?.tipo === 'arrepentimiento' && !r.accion.tracking

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 border-b border-gray-100 last:border-b-0 text-sm" data-testid={`buscador-resultado-${idx}`}>
      <button
        onClick={() => onIr(r.tab)}
        title="Ver en la pestaña"
        className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5 hover:bg-violet-100 whitespace-nowrap"
      >
        {LABEL_TAB[r.tab]} →
      </button>
      <span className="font-medium text-gray-900">{r.titulo}</span>
      {r.dni && <span className="text-xs text-gray-500">DNI {r.dni}</span>}
      {r.orden && <span className="font-mono text-xs text-gray-600">{r.orden}</span>}
      {r.tracking && (
        <a
          href={`https://www.andreani.com/envio/${r.tracking}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-blue-600 hover:underline"
        >
          {r.tracking}
        </a>
      )}
      {r.producto && <span className="text-xs text-gray-500">{r.producto}</span>}
      <span className="text-xs text-gray-600">{r.estado}</span>
      {botones.length > 0 && (
        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
          {error && <span className="text-xs text-red-600">{error}</span>}
          {armado === 'descartar' && r.accion?.tipo === 'arrepentimiento' && (
            <select
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-1.5 py-1"
            >
              {MOTIVOS_DESCARTE_ARREPENTIMIENTO.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          {botones.map(b => (
            <button
              key={b.key}
              onClick={() => clickear(b.key)}
              disabled={enviando || (b.key === 'confirmar' && confirmarDeshabilitado)}
              title={b.key === 'confirmar' && confirmarDeshabilitado ? 'Sin despacho: anular la orden y descartar' : b.title}
              className={`text-xs font-medium rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40 ${
                armado === b.key ? 'bg-gray-900 text-white' : b.cls
              }`}
            >
              {armado === b.key ? b.confirm : b.label}
            </button>
          ))}
        </span>
      )}
    </div>
  )
}

export default function BuscadorEnvios({ fuentes }: { fuentes: FuentesBusqueda }) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState('')

  const resultados = useMemo(() => buscarEnvios(query, fuentes), [query, fuentes])
  const activo = query.replace(/[.\s-]/g, '').length >= 4

  const irATab = (tab: string) => {
    router.replace(`${pathname}?tab=${tab}`, { scroll: false })
  }

  return (
    <div className="mb-4">
      <div className="relative max-w-xl">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar DNI, tracking Andreani, orden o IMEI en todas las pestañas…"
          className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
      </div>
      {activo && (
        <div className="mt-2 max-w-3xl bg-white border border-gray-200 rounded-xl shadow-sm">
          {resultados.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">
              Sin resultados en Alertas, Demoras, Arrepentimientos, Rescates y Siniestros.
            </p>
          ) : (
            resultados.map((r, i) => <Tarjeta key={`${r.tab}-${r.orden ?? r.tracking ?? r.titulo}-${i}`} r={r} idx={i} onIr={irATab} />)
          )}
        </div>
      )}
    </div>
  )
}
