'use client'

import type { VentasPorProvincia, VentasPorCiudad } from '@/lib/gocelular'

interface Props {
  provincias: VentasPorProvincia[]
  ciudades: VentasPorCiudad[]
}

export default function GeografiaVentas({ provincias, ciudades }: Props) {
  const totalProv = provincias.reduce((s, p) => s + p.ordenes, 0)
  const totalCiudad = ciudades.reduce((s, c) => s + c.ordenes, 0)
  const maxProv = provincias.length > 0 ? provincias[0].ordenes : 1
  const maxCiudad = ciudades.length > 0 ? ciudades[0].ordenes : 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Donde vendemos</h2>
      <p className="text-xs text-gray-400 mb-4">{totalProv} ordenes propias con datos de envio</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Top 10 Provincias */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top 10 Provincias</h3>
          <div className="space-y-2">
            {provincias.slice(0, 10).map((p, i) => {
              const pct = p.ordenes / maxProv
              return (
                <div key={p.provincia} className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-5 text-right ${i < 3 ? 'text-magenta-700' : 'text-gray-400'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-xs truncate ${i < 3 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{p.provincia}</span>
                      <span className={`text-xs font-bold ml-2 shrink-0 ${i < 3 ? 'text-magenta-700' : 'text-gray-600'}`}>{p.ordenes}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${i < 3 ? 'bg-magenta-500' : 'bg-indigo-300'}`} style={{ width: `${pct * 100}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top 10 Ciudades */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top 10 Ciudades</h3>
          <div className="space-y-2">
            {ciudades.slice(0, 10).map((c, i) => {
              const pct = c.ordenes / maxCiudad
              return (
                <div key={c.ciudad} className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-5 text-right ${i < 3 ? 'text-blue-700' : 'text-gray-400'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`text-xs truncate ${i < 3 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{c.ciudad}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">({c.provincia.slice(0, 3).toUpperCase()})</span>
                      </div>
                      <span className={`text-xs font-bold ml-2 shrink-0 ${i < 3 ? 'text-blue-700' : 'text-gray-600'}`}>{c.ordenes}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${i < 3 ? 'bg-blue-500' : 'bg-blue-200'}`} style={{ width: `${pct * 100}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
