'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { agregarAsistencia, agregarEgreso, eliminarAsistencia, eliminarEgreso, setProyeccionDiaria } from '@/lib/actions/finanzas'

export function CargarAsistenciaButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fecha, setFecha] = useState('')
  const [monto, setMonto] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fecha || !monto) return
    setLoading(true)
    await agregarAsistencia({ fecha, monto: Number(monto) })
    setLoading(false)
    setFecha('')
    setMonto('')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-5 py-2 bg-magenta-600 text-white text-sm font-semibold rounded-lg hover:bg-magenta-700 transition-colors"
      >
        Cargar asistencia
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cargar asistencia</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monto</label>
                <input
                  type="number"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  required
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-magenta-600 text-white text-sm font-semibold rounded-lg hover:bg-magenta-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function CargarEgresoButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [flujoDia, setFlujoDia] = useState('')
  const [concepto, setConcepto] = useState('Celulares')
  const [medioDePago, setMedioDePago] = useState('Efectivo')
  const [cuotas, setCuotas] = useState('1')
  const [monto, setMonto] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!flujoDia || !monto) return
    setLoading(true)
    await agregarEgreso({
      flujo_dia: flujoDia,
      concepto,
      medio_de_pago: medioDePago,
      cuotas: Number(cuotas),
      monto: Number(monto),
    })
    setLoading(false)
    setFlujoDia('')
    setConcepto('Celulares')
    setMedioDePago('Efectivo')
    setCuotas('1')
    setMonto('')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-5 py-2 bg-magenta-600 text-white text-sm font-semibold rounded-lg hover:bg-magenta-700 transition-colors"
      >
        Cargar egreso
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cargar egreso</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                <input
                  type="date"
                  value={flujoDia}
                  onChange={(e) => setFlujoDia(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Concepto</label>
                <select
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="Celulares">Celulares</option>
                  <option value="Licencias">Licencias</option>
                  <option value="Descartables">Descartables</option>
                  <option value="Sueldos">Sueldos</option>
                  <option value="Envios">Envios</option>
                  <option value="Interes">Interes</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Medio de pago</label>
                <input
                  type="text"
                  value={medioDePago}
                  onChange={(e) => setMedioDePago(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cuotas</label>
                <input
                  type="number"
                  value={cuotas}
                  onChange={(e) => setCuotas(e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monto</label>
                <input
                  type="number"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  required
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-magenta-600 text-white text-sm font-semibold rounded-lg hover:bg-magenta-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function ProyeccionButton({ valorActual }: { valorActual: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [monto, setMonto] = useState(String(valorActual))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await setProyeccionDiaria(Number(monto))
    setLoading(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => { setMonto(String(valorActual)); setOpen(true) }}
        className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
      >
        Ingreso proyectado {valorActual > 0 ? `($${new Intl.NumberFormat('es-AR').format(valorActual)}/día)` : ''}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Ingreso proyectado diario</h3>
            <p className="text-xs text-gray-500 mb-4">
              Se aplica desde hoy + 2 días hábiles. Martes se triplica (cobro de fin de semana). Poné 0 para desactivar.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monto diario base</label>
                <input
                  type="number"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  required
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function EliminarButton({ type, id }: { type: 'asistencia' | 'egreso'; id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('¿Eliminar este registro?')) return
    setLoading(true)
    if (type === 'asistencia') {
      await eliminarAsistencia(id)
    } else {
      await eliminarEgreso(id)
    }
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
    >
      {loading ? '...' : 'Eliminar'}
    </button>
  )
}
