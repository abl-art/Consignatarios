'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { crearProspecto, moverProspecto, actualizarSucursales, actualizarContacto, actualizarAsignado, type Prospecto, type ProspectoStats } from '@/lib/actions/crm-terceros'

interface Props {
  prospectos: Prospecto[]
  stats: ProspectoStats[]
}

const ESTADOS = [
  { key: 'prospecto', label: 'Prospecto', color: 'blue' },
  { key: 'propuesta', label: 'Propuesta y seguimiento', color: 'yellow' },
  { key: 'ganado', label: 'Ganado', color: 'green' },
  { key: 'perdido', label: 'Perdido', color: 'red' },
] as const

export default function CRMClient({ prospectos, stats }: Props) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const [asignado, setAsignado] = useState('')
  const [sucursales, setSucursales] = useState(1)
  const [creando, setCreando] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function handleCrear() {
    if (!nombre.trim()) return
    setCreando(true)
    await crearProspecto(nombre.trim(), sucursales, contacto.trim(), asignado.trim())
    setNombre('')
    setContacto('')
    setAsignado('')
    setSucursales(1)
    setShowForm(false)
    setCreando(false)
    router.refresh()
  }

  async function handleMover(id: string, estado: 'prospecto' | 'propuesta' | 'ganado' | 'perdido') {
    await moverProspecto(id, estado)
    router.refresh()
  }

  async function handleSucursales(id: string, value: number) {
    await actualizarSucursales(id, value)
    router.refresh()
  }

  async function handleContacto(id: string, value: string) {
    await actualizarContacto(id, value)
  }

  async function handleAsignado(id: string, value: string) {
    await actualizarAsignado(id, value)
  }

  const colorMap = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', header: 'bg-blue-100 text-blue-800', badge: 'bg-blue-600' },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', header: 'bg-amber-100 text-amber-800', badge: 'bg-amber-600' },
    green: { bg: 'bg-green-50', border: 'border-green-200', header: 'bg-green-100 text-green-800', badge: 'bg-green-600' },
    red: { bg: 'bg-red-50', border: 'border-red-200', header: 'bg-red-100 text-red-800', badge: 'bg-red-600' },
  }

  return (
    <>
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {ESTADOS.map(e => {
          const s = stats.find(st => st.estado === e.key)
          const colors = colorMap[e.color]
          return (
            <div key={e.key} className={`${colors.bg} border ${colors.border} rounded-xl p-4`}>
              <p className="text-xs text-gray-600 mb-1">{e.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-bold text-gray-900">{s?.count ?? 0}</p>
                <p className="text-xs text-gray-500">{s?.sucursales ?? 0} sucursales</p>
              </div>
              <p className="text-xs text-gray-400 mt-1">Promedio: {s?.tiempoPromedio ?? 0} dias</p>
            </div>
          )
        })}
      </div>

      {/* New prospecto button */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          className="mb-4 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">
          + Nuevo prospecto
        </button>
      ) : (
        <div className="mb-4 flex items-end gap-3 bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex-1">
            <label className="text-[10px] text-gray-500">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="Prospecto" />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-gray-500">Contacto</label>
            <input value={contacto} onChange={e => setContacto(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="Nombre o tel" />
          </div>
          <div className="w-28">
            <label className="text-[10px] text-gray-500">Asignado a</label>
            <input value={asignado} onChange={e => setAsignado(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="Responsable" />
          </div>
          <div className="w-20">
            <label className="text-[10px] text-gray-500">Suc.</label>
            <input type="number" min={1} value={sucursales} onChange={e => setSucursales(Number(e.target.value))}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
          </div>
          <button onClick={handleCrear} disabled={creando}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50">
            {creando ? '...' : 'Crear'}
          </button>
          <button onClick={() => setShowForm(false)} className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600">X</button>
        </div>
      )}

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {ESTADOS.map(e => {
          const colors = colorMap[e.color]
          const items = prospectos.filter(p => p.estado === e.key)
          return (
            <div key={e.key} className="min-h-[200px]">
              <div className={`${colors.header} rounded-t-xl px-4 py-2 text-sm font-semibold flex justify-between`}>
                <span>{e.label}</span>
                <span className={`${colors.badge} text-white text-xs px-2 py-0.5 rounded-full`}>{items.length}</span>
              </div>
              <div className={`${colors.bg} border ${colors.border} border-t-0 rounded-b-xl p-1.5 space-y-1`}>
                {items.map(p => {
                  const entradaAt = e.key === 'prospecto' ? p.prospecto_at
                    : e.key === 'propuesta' ? p.propuesta_at
                    : e.key === 'ganado' ? p.ganado_at
                    : p.perdido_at
                  const dias = entradaAt ? Math.round((Date.now() - new Date(entradaAt).getTime()) / 86400000) : 0

                  return (
                    <div key={p.id} className="bg-white rounded border border-gray-200 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-xs text-gray-900 truncate">{p.nombre}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{dias}d</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <input placeholder="contacto"
                          defaultValue={p.contacto || ''}
                          onBlur={ev => handleContacto(p.id, ev.target.value)}
                          className="flex-1 min-w-0 px-1 py-0 border-0 border-b border-gray-100 text-[10px] text-gray-500 focus:border-gray-300 focus:outline-none" />
                        <input placeholder="asignado"
                          defaultValue={p.asignado || ''}
                          onBlur={ev => handleAsignado(p.id, ev.target.value)}
                          className="flex-1 min-w-0 px-1 py-0 border-0 border-b border-gray-100 text-[10px] text-violet-600 focus:border-violet-300 focus:outline-none" />
                        <input type="number" min={0} value={p.sucursales}
                          onChange={ev => handleSucursales(p.id, Number(ev.target.value))}
                          className="w-10 px-1 py-0 border border-gray-200 rounded text-[10px] text-center" />
                        <span className="text-[10px] text-gray-400">suc</span>
                      </div>
                      <div className="flex gap-0.5 mt-1">
                        {e.key !== 'prospecto' && (
                          <button onClick={() => handleMover(p.id, 'prospecto')}
                            className="text-[9px] px-1.5 py-0 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">← Prosp</button>
                        )}
                        {e.key === 'prospecto' && (
                          <button onClick={() => handleMover(p.id, 'propuesta')}
                            className="text-[9px] px-1.5 py-0 bg-amber-100 text-amber-700 rounded hover:bg-amber-200">Propuesta →</button>
                        )}
                        {e.key === 'propuesta' && (
                          <>
                            <button onClick={() => handleMover(p.id, 'ganado')}
                              className="text-[9px] px-1.5 py-0 bg-green-100 text-green-700 rounded hover:bg-green-200">Ganado</button>
                            <button onClick={() => handleMover(p.id, 'perdido')}
                              className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 rounded hover:bg-red-200">Perdido</button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
