'use client'

import { useState } from 'react'
import { formatearMoneda } from '@/lib/utils'

export interface VentaRow {
  id: string
  consignatario_id: string
  consignatario_nombre: string
  store_name: string | null
  fecha_venta: string
  imei: string
  marca: string
  modelo: string
  precio_venta: number
  comision_monto: number
}

interface Props { rows: VentaRow[]; hideConsignatarioLevel?: boolean }

export default function VentasView({ rows, hideConsignatarioLevel }: Props) {
  // Group: consignatario -> store_name -> list
  const byConsig = new Map<string, { nombre: string; stores: Map<string, VentaRow[]> }>()
  for (const r of rows) {
    if (!byConsig.has(r.consignatario_id)) byConsig.set(r.consignatario_id, { nombre: r.consignatario_nombre, stores: new Map() })
    const stores = byConsig.get(r.consignatario_id)!.stores
    const key = r.store_name ?? '(sin sucursal)'
    if (!stores.has(key)) stores.set(key, [])
    stores.get(key)!.push(r)
  }

  const totalMonto = rows.reduce((s, r) => s + r.precio_venta, 0)
  const totalNeto = totalMonto / 1.21
  const totalComision = rows.reduce((s, r) => s + r.comision_monto, 0)

  return (
    <div className="space-y-4">
      <div className="bg-magenta-50 border border-magenta-200 rounded-xl p-5 flex flex-wrap gap-6">
        <div><p className="text-xs text-gray-500">Ventas</p><p className="text-xl font-bold">{rows.length}</p></div>
        <div><p className="text-xs text-gray-500">Bruto</p><p className="text-xl font-bold text-gray-900">{formatearMoneda(totalMonto)}</p></div>
        <div><p className="text-xs text-gray-500">Neto (s/IVA)</p><p className="text-xl font-bold text-gray-700">{formatearMoneda(totalNeto)}</p></div>
        <div><p className="text-xs text-gray-500">Comisiones</p><p className="text-xl font-bold text-magenta-700">{formatearMoneda(totalComision)}</p></div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center text-gray-400">
          No hay ventas para el filtro seleccionado.
        </div>
      ) : (
        Array.from(byConsig.entries()).map(([cid, c]) => {
          const allRows = Array.from(c.stores.values()).flat()
          const consigMonto = allRows.reduce((s, r) => s + r.precio_venta, 0)
          const consigComision = allRows.reduce((s, r) => s + r.comision_monto, 0)
          return <ConsigGroup key={cid} nombre={c.nombre} stores={c.stores} count={allRows.length} monto={consigMonto} comision={consigComision} hideLevel={hideConsignatarioLevel} />
        })
      )}
    </div>
  )
}

function ConsigGroup({ nombre, stores, count, monto, comision, hideLevel }: { nombre: string; stores: Map<string, VentaRow[]>; count: number; monto: number; comision: number; hideLevel?: boolean }) {
  const [open, setOpen] = useState(true)
  if (hideLevel) {
    return (
      <div className="space-y-3">
        {Array.from(stores.entries()).map(([store, list]) => <StoreGroup key={store} store={store} list={list} />)}
      </div>
    )
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 text-left">
        <div className="flex items-center gap-3">
          <span className="text-lg">{open ? '▾' : '▸'}</span>
          <span className="font-bold text-gray-900">{nombre}</span>
          <span className="text-xs text-gray-500">{count} ventas</span>
        </div>
        <div className="flex gap-6 text-sm">
          <span className="text-gray-700">{formatearMoneda(monto)}</span>
          <span className="font-bold text-magenta-700">{formatearMoneda(comision)}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-200">
          {Array.from(stores.entries()).map(([store, list]) => <StoreGroup key={store} store={store} list={list} />)}
        </div>
      )}
    </div>
  )
}

function StoreGroup({ store, list }: { store: string; list: VentaRow[] }) {
  const [open, setOpen] = useState(false)
  const monto = list.reduce((s, r) => s + r.precio_venta, 0)
  const comision = list.reduce((s, r) => s + r.comision_monto, 0)
  return (
    <div className="border-b border-gray-100 last:border-0 bg-white rounded-xl">
      <button onClick={() => setOpen(!open)} className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 text-left bg-gray-50/70">
        <div className="flex items-center gap-3">
          <span>{open ? '▾' : '▸'}</span>
          <span className="font-medium text-gray-800">{store}</span>
          <span className="text-xs text-gray-500">{list.length} ventas</span>
        </div>
        <div className="flex gap-6 text-sm">
          <span className="text-gray-700">{formatearMoneda(monto)}</span>
          <span className="font-semibold text-magenta-700">{formatearMoneda(comision)}</span>
        </div>
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-t border-gray-200">
            <tr>
              <th className="text-left px-6 py-2 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-6 py-2 font-medium text-gray-600">IMEI</th>
              <th className="text-left px-6 py-2 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-6 py-2 font-medium text-gray-600">Bruto</th>
              <th className="text-right px-6 py-2 font-medium text-gray-600">Neto</th>
              <th className="text-right px-6 py-2 font-medium text-gray-600">Comisi&oacute;n</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((r) => (
              <tr key={r.id}>
                <td className="px-6 py-2 text-gray-700">{new Date(r.fecha_venta).toLocaleDateString('es-AR')}</td>
                <td className="px-6 py-2 font-mono text-xs text-gray-700">{r.imei}</td>
                <td className="px-6 py-2 text-gray-800">{r.marca} {r.modelo}</td>
                <td className="px-6 py-2 text-right text-gray-800">{formatearMoneda(r.precio_venta)}</td>
                <td className="px-6 py-2 text-right text-gray-600">{formatearMoneda(r.precio_venta / 1.21)}</td>
                <td className="px-6 py-2 text-right font-semibold text-magenta-700">{formatearMoneda(r.comision_monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
