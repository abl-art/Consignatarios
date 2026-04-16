'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validarIMEI } from '@/lib/utils'

export default function CargaIndividual({ onCreado }: { onCreado: () => void }) {
  const [imei, setImei] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [precio, setPrecio] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)

    const imeiClean = imei.trim()
    const marcaClean = marca.trim()
    const modeloClean = modelo.trim()
    const precioNum = parseFloat(precio)

    if (!validarIMEI(imeiClean)) {
      setMsg({ type: 'error', text: 'IMEI inválido — debe tener 15 dígitos numéricos' })
      return
    }
    if (!marcaClean || !modeloClean) {
      setMsg({ type: 'error', text: 'Marca y modelo son obligatorios' })
      return
    }
    if (isNaN(precioNum) || precioNum < 0) {
      setMsg({ type: 'error', text: 'Precio costo inválido' })
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()

      // Buscar o crear modelo (y actualizar precio si ya existe)
      let { data: modeloRow } = await supabase
        .from('modelos')
        .select('id')
        .eq('marca', marcaClean)
        .eq('modelo', modeloClean)
        .single()

      if (modeloRow) {
        await supabase.from('modelos').update({ precio_costo: precioNum }).eq('id', modeloRow.id)
      } else {
        const { data: nuevoModelo, error: errorModelo } = await supabase
          .from('modelos')
          .insert({ marca: marcaClean, modelo: modeloClean, precio_costo: precioNum })
          .select('id')
          .single()
        if (errorModelo || !nuevoModelo) {
          setMsg({ type: 'error', text: `Error creando modelo: ${errorModelo?.message ?? 'desconocido'}` })
          setLoading(false)
          return
        }
        modeloRow = nuevoModelo
      }

      // Insertar dispositivo
      const { error: errorDispositivo } = await supabase
        .from('dispositivos')
        .insert({ imei: imeiClean, modelo_id: modeloRow.id, estado: 'disponible' })

      if (errorDispositivo) {
        if (errorDispositivo.code === '23505') {
          setMsg({ type: 'error', text: `IMEI ${imeiClean} ya existe en el sistema` })
        } else {
          setMsg({ type: 'error', text: errorDispositivo.message })
        }
        setLoading(false)
        return
      }

      setMsg({ type: 'ok', text: `Dispositivo ${imeiClean} cargado correctamente` })
      setImei('')
      // dejo marca/modelo/precio para cargar otro del mismo lote rápido
      onCreado()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Cargar dispositivo individual
      </h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">IMEI</label>
          <input
            value={imei}
            onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
            placeholder="15 dígitos"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Precio costo (pesos)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="Ej: 180000"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
          <input
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            placeholder="Ej: Samsung"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
          <input
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="Ej: Galaxy A54"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="col-span-2 flex items-center justify-between">
          {msg ? (
            <p className={`text-sm ${msg.type === 'ok' ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 disabled:opacity-50"
          >
            {loading ? 'Cargando...' : 'Agregar dispositivo'}
          </button>
        </div>
      </form>
    </div>
  )
}
