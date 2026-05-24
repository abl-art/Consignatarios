'use client'

import type { GeografiaData } from '@/lib/gocelular'

export default function GeografiaVentas({ data }: { data: GeografiaData }) {
  const { provincias, ciudades, totalOrdenes, retirosSucursal, pctRetiros } = data
  const maxProv = provincias.length > 0 ? provincias[0].ordenes : 1
  const maxCiudad = ciudades.length > 0 ? ciudades[0].ordenes : 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Donde vendemos</h2>
          <p className="text-xs text-gray-400">{totalOrdenes.toLocaleString('es-AR')} ordenes propias</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-indigo-700">{pctRetiros}%</p>
          <p className="text-[10px] text-gray-400">retiro en sucursal ({retirosSucursal})</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Top 5 Provincias */}
        <div>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Top 5 Provincias</h3>
          <div className="space-y-1.5">
            {provincias.slice(0, 5).map((p, i) => (
              <div key={p.provincia} className="flex items-center gap-2">
                <span className={`text-xs font-bold w-4 text-right ${i < 3 ? 'text-magenta-700' : 'text-gray-400'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs truncate ${i < 3 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{p.provincia}</span>
                    <span className={`text-xs font-bold ml-2 shrink-0 ${i < 3 ? 'text-magenta-700' : 'text-gray-600'}`}>{p.ordenes}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1">
                    <div className={`h-1 rounded-full ${i < 3 ? 'bg-magenta-500' : 'bg-indigo-300'}`} style={{ width: `${(p.ordenes / maxProv) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Ciudades */}
        <div>
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Top 5 Ciudades</h3>
          <div className="space-y-1.5">
            {ciudades.slice(0, 5).map((c, i) => (
              <div key={c.ciudad} className="flex items-center gap-2">
                <span className={`text-xs font-bold w-4 text-right ${i < 3 ? 'text-blue-700' : 'text-gray-400'}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className={`text-xs truncate ${i < 3 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{c.ciudad}</span>
                      <span className="text-[9px] text-gray-400 shrink-0">({c.provincia.slice(0, 3)})</span>
                    </div>
                    <span className={`text-xs font-bold ml-2 shrink-0 ${i < 3 ? 'text-blue-700' : 'text-gray-600'}`}>{c.ordenes}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1">
                    <div className={`h-1 rounded-full ${i < 3 ? 'bg-blue-500' : 'bg-blue-200'}`} style={{ width: `${(c.ordenes / maxCiudad) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
