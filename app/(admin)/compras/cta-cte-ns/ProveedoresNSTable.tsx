'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ProveedorNS } from '@/lib/actions/netsuite'

function fmtPesos(n: number): string {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function ProveedoresNSTable({ proveedores, desde, hasta }: { proveedores: ProveedorNS[]; desde: string; hasta: string }) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState('')
  const [fDesde, setFDesde] = useState(desde)
  const [fHasta, setFHasta] = useState(hasta)

  const filtrados = busqueda.trim()
    ? proveedores.filter(p =>
        normalizar(p.nombre).includes(normalizar(busqueda)) || (p.cuit ?? '').includes(busqueda.trim())
      )
    : proveedores

  const aplicarFechas = (d: string, h: string) => {
    const params = new URLSearchParams()
    if (d) params.set('desde', d)
    if (h) params.set('hasta', h)
    router.push(`/compras/cta-cte-ns${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const hayFiltroFechas = Boolean(desde || hasta)

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar proveedor por nombre o CUIT..."
          className="w-full md:w-80 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Desde</label>
          <input
            type="date"
            value={fDesde}
            onChange={e => { setFDesde(e.target.value); aplicarFechas(e.target.value, fHasta) }}
            className="px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <label className="text-xs text-gray-500">Hasta</label>
          <input
            type="date"
            value={fHasta}
            onChange={e => { setFHasta(e.target.value); aplicarFechas(fDesde, e.target.value) }}
            className="px-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {hayFiltroFechas && (
            <button
              onClick={() => { setFDesde(''); setFHasta(''); aplicarFechas('', '') }}
              className="px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700"
            >
              Limpiar
            </button>
          )}
        </div>
        {busqueda.trim() && (
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {filtrados.length} de {proveedores.length}
          </span>
        )}
      </div>
      {hayFiltroFechas && (
        <p className="text-xs text-gray-500 mb-3">
          Mostrando facturas {desde && `desde el ${desde.split('-').reverse().join('/')}`} {hasta && `hasta el ${hasta.split('-').reverse().join('/')}`} — los totales y saldos corresponden solo a ese período.
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Proveedor</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Facturas</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Total comprado</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Pagado</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Saldo</th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">Última factura</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(p => (
              <tr key={p.vendorId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/compras/cta-cte-ns/${p.vendorId}`} className="font-medium text-gray-900 hover:underline">
                    {p.nombre}
                  </Link>
                  {p.cuit && <span className="block text-xs text-gray-400">CUIT {p.cuit}</span>}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600">{p.facturas}</td>
                <td className="px-3 py-2.5 text-right text-gray-900">{fmtPesos(p.totalComprado)}</td>
                <td className="px-3 py-2.5 text-right text-gray-600">{fmtPesos(p.totalPagado)}</td>
                <td className={`px-3 py-2.5 text-right font-semibold ${p.saldo > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {fmtPesos(p.saldo)}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-600">{fmtFecha(p.ultimaFactura)}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  No hay proveedores que coincidan con &ldquo;{busqueda}&rdquo;
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
