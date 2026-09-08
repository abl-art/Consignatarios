'use client'

import { useState, useTransition } from 'react'
import { setContactado, setNotaUpselling, type UpsellingData } from '@/lib/actions/upselling'
import { waLink } from '@/lib/upselling'

type Fila = UpsellingData['filas'][number]

const fmtFecha = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

const fmtMonto = (n: number): string =>
  '$' + Math.round(n).toLocaleString('es-AR')

type Filtro = 'todos' | 'pendientes' | 'contactados' | 'recompras'

export default function UpsellingTable({ filas }: { filas: Fila[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const visibles = filas.filter(f =>
    filtro === 'pendientes' ? !f.contactadoAt
    : filtro === 'contactados' ? !!f.contactadoAt && !f.recompra
    : filtro === 'recompras' ? !!f.recompra
    : true
  )

  const pills: { key: Filtro; label: string; n: number }[] = [
    { key: 'todos', label: 'Todos', n: filas.length },
    { key: 'pendientes', label: 'Sin contactar', n: filas.filter(f => !f.contactadoAt).length },
    { key: 'contactados', label: 'Contactados', n: filas.filter(f => f.contactadoAt && !f.recompra).length },
    { key: 'recompras', label: 'Recompraron', n: filas.filter(f => f.recompra).length },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex flex-wrap gap-2 mb-3">
        {pills.map(p => (
          <button
            key={p.key}
            onClick={() => setFiltro(p.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filtro === p.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {p.label} ({p.n})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <th className="py-1.5 px-2 font-medium">Cliente</th>
              <th className="py-1.5 px-2 font-medium">Teléfono</th>
              <th className="py-1.5 px-2 font-medium">Equipo pagado</th>
              <th className="py-1.5 px-2 font-medium text-right">Última cuota</th>
              <th className="py-1.5 px-2 font-medium text-right">Monto</th>
              <th className="py-1.5 px-2 font-medium text-center">Contactado</th>
              <th className="py-1.5 px-2 font-medium text-center">Volvió a comprar</th>
              <th className="py-1.5 px-2 font-medium w-64">Notas</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(f => (
              <FilaCliente key={f.userId} fila={f} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Clientes con el 100% de las cuotas cobradas (GOcuotas) · Teléfono verificado del checkout, click abre WhatsApp · Contactado guarda la fecha del tilde · Volvió a comprar se marca solo si aparece una orden nueva DESPUÉS de la fecha de contacto · Las notas se guardan al salir del campo
      </p>
    </div>
  )
}

function FilaCliente({ fila }: { fila: Fila }) {
  const [pending, startTransition] = useTransition()
  const [contactado, setContactadoLocal] = useState(!!fila.contactadoAt)
  const [nota, setNota] = useState(fila.nota)
  const [notaGuardada, setNotaGuardada] = useState(fila.nota)

  const toggleContactado = (checked: boolean) => {
    setContactadoLocal(checked)
    startTransition(async () => {
      const r = await setContactado(fila.userId, checked)
      if ('error' in r) setContactadoLocal(!checked)
    })
  }

  const guardarNota = () => {
    if (nota === notaGuardada) return
    startTransition(async () => {
      const r = await setNotaUpselling(fila.userId, nota)
      if ('error' in r) setNota(notaGuardada)
      else setNotaGuardada(nota)
    })
  }

  return (
    <tr className={`border-b border-gray-100 ${pending ? 'opacity-60' : ''}`}>
      <td className="py-1.5 px-2">
        <span className="text-gray-900">{fila.nombre || '—'}</span>
        <span className="block text-[10px] text-gray-400">
          DNI {fila.dni || '—'} · {fila.canal}{fila.ordenesPagas > 1 ? ` · ${fila.ordenesPagas} órdenes pagas` : ''}
        </span>
      </td>
      <td className="py-1.5 px-2">
        {fila.telefono ? (
          <a href={waLink(fila.telefono)} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline whitespace-nowrap">
            {fila.telefono}
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-gray-700">{fila.producto ?? '—'}</td>
      <td className="py-1.5 px-2 text-right whitespace-nowrap">{fmtFecha(fila.ultimaCuotaAt)}</td>
      <td className="py-1.5 px-2 text-right whitespace-nowrap">{fmtMonto(fila.monto)}</td>
      <td className="py-1.5 px-2 text-center">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={contactado}
            onChange={e => toggleContactado(e.target.checked)}
            className="h-4 w-4 accent-gray-900 cursor-pointer"
          />
          {fila.contactadoAt && contactado && (
            <span className="text-[10px] text-gray-400">{fmtFecha(fila.contactadoAt)}</span>
          )}
        </label>
      </td>
      <td className="py-1.5 px-2 text-center">
        {fila.recompra ? (
          <span className="text-green-700 font-medium whitespace-nowrap" title={fila.recompra.producto ?? undefined}>
            ✅ {fmtFecha(fila.recompra.createdAt)}
            {fila.recompra.producto && (
              <span className="block text-[10px] text-gray-400 font-normal">{fila.recompra.producto}</span>
            )}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="py-1.5 px-2">
        <input
          type="text"
          value={nota}
          onChange={e => setNota(e.target.value)}
          onBlur={guardarNota}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="Qué se le ofreció / respuesta…"
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-gray-400"
        />
      </td>
    </tr>
  )
}
