'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { marcarTacsCargados, procesarArchivoTerceros, sincronizarTacsInventario, type TacCargado, type TacPendiente } from '@/lib/actions/tacs'

interface Props {
  cargados: TacCargado[]
  pendientesInv: TacPendiente[]
}

export default function GestionTacsClient({ cargados, pendientesInv }: Props) {
  const router = useRouter()
  const [pendientes, setPendientes] = useState<TacPendiente[]>(pendientesInv)
  const [pendientesTerceros, setPendientesTerceros] = useState<TacPendiente[]>([])
  const [uploading, setUploading] = useState(false)
  const [marcando, setMarcando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [showCargados, setShowCargados] = useState(false)
  const [filtroMarca, setFiltroMarca] = useState('')

  const todosPendientes = [...pendientes, ...pendientesTerceros]
  const marcas = [...new Set(cargados.map(t => t.marca))].sort()

  // Agrupar cargados por marca → modelo → TACs
  const cargadosPorMarca = cargados.reduce((map, t) => {
    if (!map[t.marca]) map[t.marca] = {}
    if (!map[t.marca][t.modelo]) map[t.marca][t.modelo] = []
    map[t.marca][t.modelo].push(t.tac)
    return map
  }, {} as Record<string, Record<string, string[]>>)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)

      const items = rows.map(row => ({
        imei: String(row['IMEI'] || row['imei'] || ''),
        marca: String(row['Marca'] || row['marca'] || row['MARCA'] || 'Desconocido'),
        modelo: String(row['Modelo'] || row['modelo'] || row['MODELO'] || 'Desconocido'),
      })).filter(i => i.imei.replace(/\D/g, '').length >= 8)

      const nuevos = await procesarArchivoTerceros(items)
      setPendientesTerceros(nuevos)
    } catch {
      alert('Error al leer el archivo')
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleMarcarCargados() {
    setMarcando(true)
    await marcarTacsCargados(todosPendientes.map(t => ({ tac: t.tac, marca: t.marca, modelo: t.modelo, origen: t.origen })))
    setPendientes([])
    setPendientesTerceros([])
    setMarcando(false)
    router.refresh()
  }

  async function handleSincronizar() {
    setSincronizando(true)
    await sincronizarTacsInventario()
    setSincronizando(false)
    router.refresh()
  }

  function descargarTemplate() {
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.aoa_to_sheet([['IMEI', 'Modelo', 'Marca']])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'TACs')
      XLSX.writeFile(wb, 'template_tacs.xlsx')
    })
  }

  function descargarPendientes() {
    if (todosPendientes.length === 0) return
    import('xlsx').then(XLSX => {
      const data = todosPendientes.map(t => ({ TAC: t.tac, Marca: t.marca, Modelo: t.modelo, Origen: t.origen }))
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'TACs Pendientes')
      XLSX.writeFile(wb, 'tacs_pendientes_trustonic.xlsx')
    })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Gestión de TACs</h1>
      <p className="text-sm text-gray-500 mb-6">Control de TACs cargados en Trustonic para bloqueo de equipos</p>

      {/* Cards resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">TACs cargados</p>
          <p className="text-3xl font-bold text-green-700">{cargados.length}</p>
        </div>
        <div className={`rounded-xl border p-5 ${todosPendientes.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <p className="text-xs text-gray-500 mb-1">TACs pendientes</p>
          <p className={`text-3xl font-bold ${todosPendientes.length > 0 ? 'text-red-700' : 'text-gray-900'}`}>{todosPendientes.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">Marcas</p>
          <p className="text-3xl font-bold text-gray-900">{marcas.length}</p>
        </div>
      </div>

      {/* TACs pendientes */}
      {todosPendientes.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-red-200 bg-red-50 flex items-center justify-between">
            <h3 className="font-semibold text-red-900">TACs pendientes de cargar en Trustonic ({todosPendientes.length})</h3>
            <div className="flex gap-2">
              <button onClick={descargarPendientes} className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Descargar lista
              </button>
              <button onClick={handleMarcarCargados} disabled={marcando}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                {marcando ? 'Marcando...' : 'Marcar todos como cargados'}
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">TAC</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Marca</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Modelo</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {todosPendientes.map(t => (
                <tr key={t.tac} className="hover:bg-red-50">
                  <td className="px-4 py-2 font-mono text-xs">{t.tac}</td>
                  <td className="px-4 py-2">{t.marca}</td>
                  <td className="px-4 py-2 text-gray-700">{t.modelo}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${t.origen === 'inventario' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {t.origen}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {todosPendientes.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center mb-6">
          <svg className="w-10 h-10 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-green-700 font-semibold">Todos los TACs están cargados en Trustonic</p>
        </div>
      )}

      {/* Acciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Subir archivo terceros */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Archivo de terceros</h3>
          <div className="flex gap-2 mb-3">
            <button onClick={descargarTemplate} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
              Descargar template
            </button>
          </div>
          <label className={`block w-full px-4 py-3 text-center text-sm border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-magenta-400 hover:bg-magenta-50 transition-colors ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? 'Procesando...' : 'Subir archivo Excel'}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          {pendientesTerceros.length > 0 && (
            <p className="text-xs text-purple-600 mt-2">{pendientesTerceros.length} TACs nuevos detectados del archivo</p>
          )}
        </div>

        {/* Sincronizar inventario */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Inventario propio</h3>
          <p className="text-xs text-gray-500 mb-3">Sincronizar TACs del inventario de GOcelular con la base de TACs cargados.</p>
          <button onClick={handleSincronizar} disabled={sincronizando}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {sincronizando ? 'Sincronizando...' : 'Sincronizar inventario'}
          </button>
        </div>
      </div>

      {/* TACs cargados por marca */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button onClick={() => setShowCargados(!showCargados)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
          <h3 className="font-semibold text-gray-900">TACs cargados por marca ({cargados.length})</h3>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${showCargados ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showCargados && (
          <div className="border-t border-gray-200">
            <div className="px-4 py-2 flex gap-1 bg-gray-50 border-b border-gray-200">
              <button onClick={() => setFiltroMarca('')}
                className={`px-3 py-1 text-xs font-medium rounded-full ${!filtroMarca ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Todas
              </button>
              {marcas.map(m => (
                <button key={m} onClick={() => setFiltroMarca(m)}
                  className={`px-3 py-1 text-xs font-medium rounded-full ${filtroMarca === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {m}
                </button>
              ))}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Marca</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Modelo</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">TACs</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Cant.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(cargadosPorMarca)
                  .filter(([marca]) => !filtroMarca || marca === filtroMarca)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .flatMap(([marca, modelos]) =>
                    Object.entries(modelos).sort(([a], [b]) => a.localeCompare(b)).map(([modelo, tacs]) => (
                      <tr key={`${marca}-${modelo}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{marca}</td>
                        <td className="px-4 py-2 text-gray-700">{modelo}</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{tacs.join(', ')}</td>
                        <td className="px-4 py-2 text-center font-bold">{tacs.length}</td>
                      </tr>
                    ))
                  )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
