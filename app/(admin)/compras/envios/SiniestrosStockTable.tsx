'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ProductoStock } from '@/lib/gocelular'
import type { SiniestroStock, TipoSiniestroStock } from '@/lib/siniestros-stock'
import {
  cargarSiniestroStock,
  setEstadoSiniestroStock,
  setNotaCreditoStock,
  setNotaSiniestroStock,
} from '@/lib/actions/siniestros-stock'

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const TIPO_META: Record<TipoSiniestroStock, { label: string; cls: string }> = {
  extraviado: { label: '❓ Extraviado', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  roto: { label: '🔧 Roto', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  hurtado: { label: '🚨 Hurtado', cls: 'bg-red-50 text-red-700 border-red-200' },
}

const UBICACION_LABEL: Record<string, string> = {
  andreani_wh: 'WH Andreani',
  local: 'WH GOcuotas',
  in_transit_andreani: 'En tránsito',
}

function TipoChip({ tipo }: { tipo: TipoSiniestroStock }) {
  const meta = TIPO_META[tipo]
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

function TrustonicChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400">—</span>
  const s = status.toLowerCase()
  // un equipo extraviado/hurtado debería estar bloqueado: locked es lo deseable
  const cls = s === 'locked' ? 'bg-green-50 text-green-700 border-green-200'
    : s === 'active' || s === 'ready_for_use' ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'
  const emoji = s === 'locked' ? '🔒' : s === 'active' || s === 'ready_for_use' ? '⚠️' : ''
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${cls}`}>
      {emoji && `${emoji} `}{status}
    </span>
  )
}

function GocelularChip({ s }: { s: SiniestroStock }) {
  if (!s.imei) return <span className="text-gray-400">—</span>
  if (!s.dispositivo) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap bg-gray-50 text-gray-600 border-gray-200"
        title="El IMEI no figura en el inventario de GOcelular">
        No figura
      </span>
    )
  }
  const d = s.dispositivo
  const disponible = s.estado === 'abierto' && d.status === 'available'
  return (
    <div>
      <span className="text-gray-600 whitespace-nowrap">{UBICACION_LABEL[d.ubicacion ?? ''] ?? d.ubicacion ?? '—'}</span>
      {disponible && (
        <div className="text-xs text-amber-600 whitespace-nowrap" title="GOcelular todavía lo cuenta como stock disponible: infla el stock hasta que se lo dé de baja">
          ⚠️ sigue disponible
        </div>
      )}
    </div>
  )
}

function CargarSiniestroStock({ productos }: { productos: ProductoStock[] }) {
  const [sku, setSku] = useState('')
  const [tipo, setTipo] = useState('extraviado')
  const [imei, setImei] = useState('')
  const [dia, setDia] = useState(() => new Date().toISOString().slice(0, 10))
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const celulares = productos.filter(p => p.tipo === 'celular')
  const accesorios = productos.filter(p => p.tipo === 'accesorio')

  const cargar = () => {
    setError(null)
    const producto = productos.find(p => p.sku === sku)
    if (!producto) {
      setError('Elegí el producto siniestrado.')
      return
    }
    startTransition(async () => {
      const res = await cargarSiniestroStock({
        producto: producto.nombre,
        sku: producto.sku,
        tipo,
        imei,
        fecha: dia,
        nota,
      })
      if (res.error) {
        setError(res.error)
      } else {
        setSku('')
        setImei('')
        setNota('')
        router.refresh()
      }
    })
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white max-w-[280px]"
        >
          <option value="">Producto siniestrado…</option>
          <optgroup label="Celulares">
            {celulares.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
          </optgroup>
          <optgroup label="Accesorios y kits">
            {accesorios.map(p => <option key={p.sku} value={p.sku}>{p.nombre}</option>)}
          </optgroup>
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
        >
          <option value="extraviado">Extraviado</option>
          <option value="roto">Roto</option>
          <option value="hurtado">Hurtado</option>
        </select>
        <input
          type="text"
          value={imei}
          onChange={(e) => setImei(e.target.value)}
          placeholder="IMEI (opcional)"
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg font-mono w-44"
        />
        <input
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
        />
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') cargar() }}
          placeholder="Nota (opcional)"
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg w-56"
        />
        <button
          onClick={cargar}
          disabled={pending || !sku}
          className="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? 'Cargando…' : '+ Cargar siniestro'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}
    </div>
  )
}

function NotaCreditoCheck({ id, emitida }: { id: string; emitida: boolean }) {
  const [checked, setChecked] = useState(emitida)
  const [pending, startTransition] = useTransition()
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      onChange={(e) => {
        const valor = e.target.checked
        setChecked(valor)
        startTransition(async () => {
          const res = await setNotaCreditoStock(id, valor)
          if (res.error) setChecked(!valor)
        })
      }}
      className="w-4 h-4 accent-green-600 cursor-pointer"
      title="Tildar cuando Andreani emitió la nota de crédito del reclamo"
    />
  )
}

function NotaEditable({ id, nota }: { id: string; nota: string | null }) {
  const [valor, setValor] = useState(nota ?? '')
  const [, startTransition] = useTransition()
  const guardar = () => {
    if (valor === (nota ?? '')) return
    startTransition(async () => { await setNotaSiniestroStock(id, valor) })
  }
  return (
    <input
      type="text"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="—"
      className="w-full min-w-[140px] px-2 py-1 text-xs border border-transparent rounded hover:border-gray-200 focus:border-gray-300 focus:outline-none bg-transparent"
    />
  )
}

function EstadoCell({ s }: { s: SiniestroStock }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const cambiar = (resuelto: boolean) => {
    startTransition(async () => {
      const res = await setEstadoSiniestroStock(s.id, resuelto)
      if (!res.error) router.refresh()
    })
  }
  if (s.estado === 'resuelto') {
    return (
      <div className="whitespace-nowrap">
        <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium bg-gray-50 text-gray-600 border-gray-200">
          🔒 Resuelto {fecha(s.resueltoAt)}
        </span>
        <button
          onClick={() => cambiar(false)}
          disabled={pending}
          className="ml-2 text-xs text-gray-400 hover:text-gray-600 underline"
        >
          reabrir
        </button>
      </div>
    )
  }
  return (
    <div className="whitespace-nowrap">
      <span className="inline-block px-2 py-0.5 rounded-full border text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
        🔎 Abierto
      </span>
      <button
        onClick={() => cambiar(true)}
        disabled={pending}
        className="ml-2 text-xs text-gray-400 hover:text-gray-600 underline"
        title="Marcar como resuelto (equipo apareció, se dio de baja o se cerró el reclamo)"
      >
        resolver
      </button>
    </div>
  )
}

export default function SiniestrosStockTable({
  siniestros,
  productos,
}: {
  siniestros: SiniestroStock[]
  productos: ProductoStock[]
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Diferencias de stock en el depósito, sin guía de Andreani: equipos extraviados, rotos o hurtados en el
        almacenamiento. Elegí el producto (el IMEI es opcional, por si no sabés qué unidad falta), y hacé el
        seguimiento del caso: tildá «Nota de crédito» si Andreani reconoce el reclamo del seguro del warehouse
        y marcá «resolver» cuando se cierre.
      </p>

      <CargarSiniestroStock productos={productos} />

      {siniestros.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-sm text-green-700 font-medium">✅ Sin diferencias de stock cargadas.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">IMEI</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" title="Ubicación del equipo en el inventario de GOcelular (solo con IMEI)">GOcelular</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" title="Estado del equipo en Trustonic: un equipo extraviado o hurtado debería estar locked">Trustonic</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" title="Fecha del hallazgo de la diferencia">Hallazgo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nota</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600" title="Tildar cuando Andreani emitió la nota de crédito del reclamo">Nota de crédito</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Caso</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600" title="Días desde el hallazgo (en resueltos, días que estuvo abierto)">Días</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {siniestros.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 max-w-[220px]">
                    <div className="truncate" title={s.producto}>{s.producto}</div>
                    {s.sku && <div className="font-mono text-xs text-gray-400">{s.sku}</div>}
                  </td>
                  <td className="px-4 py-3"><TipoChip tipo={s.tipo} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.imei ?? '—'}</td>
                  <td className="px-4 py-3"><GocelularChip s={s} /></td>
                  <td className="px-4 py-3"><TrustonicChip status={s.dispositivo?.trustonicStatus ?? null} /></td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(s.fecha)}</td>
                  <td className="px-4 py-3"><NotaEditable id={s.id} nota={s.nota} /></td>
                  <td className="px-4 py-3 text-center"><NotaCreditoCheck id={s.id} emitida={s.notaCredito} /></td>
                  <td className="px-4 py-3"><EstadoCell s={s} /></td>
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{s.dias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
