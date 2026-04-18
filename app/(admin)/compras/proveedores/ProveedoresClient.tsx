'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { agregarProveedor, editarProveedor, eliminarProveedor } from '@/lib/actions/compras'

interface Proveedor {
  id: string
  nombre: string
  contacto: string
  cuit: string
  whatsapp: string
  email: string
  direccion: string // reused for tipo_producto
  notas: string // JSON: { marcas: string[], plazos: string, observaciones: string }
}

const TIPOS_PRODUCTO = ['Celulares', 'Smartwatches', 'Parlantes', 'Auriculares', 'Kits de Seguridad']
const MARCAS_CELULARES = ['Motorola', 'Samsung', 'Nubia', 'Xiaomi', 'Honor']
const PLAZOS_OPTIONS = [
  '30 días',
  '60 días',
  '90 días',
  '30 y 60 días',
  '30, 60 y 90 días',
  '30, 60, 90 y 120 días',
]

function parseNotas(notas: string): { marcas: string[]; plazos: string; observaciones: string } {
  try {
    const parsed = JSON.parse(notas)
    return { marcas: parsed.marcas || [], plazos: parsed.plazos || '', observaciones: parsed.observaciones || '' }
  } catch {
    return { marcas: [], plazos: '', observaciones: notas || '' }
  }
}

function buildNotas(marcas: string[], plazos: string, observaciones: string): string {
  return JSON.stringify({ marcas, plazos, observaciones })
}

export default function ProveedoresClient({ proveedores }: { proveedores: Proveedor[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const [cuit, setCuit] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [email, setEmail] = useState('')
  const [tipoProducto, setTipoProducto] = useState('')
  const [marcas, setMarcas] = useState<string[]>([])
  const [plazos, setPlazos] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [loading, setLoading] = useState(false)

  function resetForm() {
    setNombre(''); setContacto(''); setCuit(''); setWhatsapp(''); setEmail('')
    setTipoProducto(''); setMarcas([]); setPlazos(''); setObservaciones('')
  }

  function startCreate() {
    setEditingId(null)
    resetForm()
    setShowForm(true)
  }

  function startEdit(p: Proveedor) {
    setEditingId(p.id)
    setNombre(p.nombre || '')
    setContacto(p.contacto || '')
    setCuit(p.cuit || '')
    setWhatsapp(p.whatsapp || '')
    setEmail(p.email || '')
    setTipoProducto(p.direccion || '')
    const parsed = parseNotas(p.notas)
    setMarcas(parsed.marcas)
    setPlazos(parsed.plazos)
    setObservaciones(parsed.observaciones)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    resetForm()
  }

  function toggleMarca(m: string) {
    setMarcas(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setLoading(true)
    const data = {
      nombre, contacto, cuit, whatsapp, email,
      direccion: tipoProducto,
      notas: buildNotas(marcas, plazos, observaciones),
    }
    if (editingId) {
      await editarProveedor(editingId, data)
    } else {
      await agregarProveedor(data)
    }
    setLoading(false)
    cancelForm()
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este proveedor?')) return
    setLoading(true)
    await eliminarProveedor(id)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/compras" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Compras
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        </div>
        <button onClick={startCreate} className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
          Nuevo Proveedor
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Nombre del proveedor" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contacto</label>
                <input type="text" value={contacto} onChange={(e) => setContacto(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Persona de contacto" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CUIT</label>
                <input type="text" value={cuit} onChange={(e) => setCuit(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="XX-XXXXXXXX-X" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</label>
                <input type="text" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="+54 9 XXX XXX XXXX" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="email@ejemplo.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de producto</label>
                <select value={tipoProducto} onChange={(e) => { setTipoProducto(e.target.value); if (e.target.value !== 'Celulares') setMarcas([]) }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">Seleccionar...</option>
                  {TIPOS_PRODUCTO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {tipoProducto === 'Celulares' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Marcas</label>
                <div className="flex flex-wrap gap-2">
                  {MARCAS_CELULARES.map(m => (
                    <button key={m} type="button" onClick={() => toggleMarca(m)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${marcas.includes(m) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-300'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plazos de pago</label>
                <select value={plazos} onChange={(e) => setPlazos(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="">Seleccionar...</option>
                  {PLAZOS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                <input type="text" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Notas adicionales..." />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={cancelForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
              <button type="submit" disabled={loading} className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}

      {proveedores.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No hay proveedores registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proveedores.map((p) => {
            const parsed = parseNotas(p.notas)
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{p.nombre}</h3>
                      {p.direccion && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{p.direccion}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-500">
                      {p.contacto && <span>Contacto: {p.contacto}</span>}
                      {p.cuit && <span>CUIT: {p.cuit}</span>}
                      {p.whatsapp && <span>WA: {p.whatsapp}</span>}
                      {p.email && <span>{p.email}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {parsed.marcas.length > 0 && parsed.marcas.map(m => (
                        <span key={m} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{m}</span>
                      ))}
                      {parsed.plazos && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{parsed.plazos}</span>}
                    </div>
                    {parsed.observaciones && <p className="text-xs text-gray-400 mt-1">{parsed.observaciones}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => startEdit(p)} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">Editar</button>
                    <button onClick={() => handleDelete(p.id)} disabled={loading} className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50">Eliminar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
