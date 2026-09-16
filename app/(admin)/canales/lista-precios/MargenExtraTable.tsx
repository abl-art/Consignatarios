'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { PROVEEDOR_NC } from '@/lib/notas-credito'
import type { DevengoMensual } from '@/lib/margen-extra'

const peso = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}/${y.slice(2)}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesCorto = (yyyyMm: string) => MESES[Number(yyyyMm.split('-')[1]) - 1] ?? yyyyMm
const mesLabel = (yyyyMm: string) => `${mesCorto(yyyyMm)} ${yyyyMm.split('-')[0]}`

const ESTADO_BONO: Record<string, { label: string; cls: string }> = {
  vigente: { label: 'Vigente', cls: 'bg-green-50 text-green-700 border-green-200' },
  agotado: { label: 'Cupo alcanzado', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  vencido: { label: 'Vencido', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  futuro: { label: 'Futuro', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}

function Tarjeta({ titulo, valor, detalle, cls }: { titulo: string; valor: string; detalle: string; cls?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${cls ?? 'text-gray-900'}`}>{valor}</p>
      <p className="text-xs text-gray-400 mt-1">{detalle}</p>
    </div>
  )
}

const pill = (activo: boolean) =>
  `px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
    activo ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
  }`

const MARCAS_FIJAS = Object.keys(PROVEEDOR_NC)

export default function MargenExtraTable({ devengos }: { devengos: DevengoMensual[] }) {
  const anios = useMemo(() => [...new Set(devengos.map(d => d.mes.slice(0, 4)))].sort().reverse(), [devengos])
  const [marca, setMarca] = useState<string | null>(null)
  const [anio, setAnio] = useState<string>(anios[0] ?? String(new Date().getFullYear()))
  const [mes, setMes] = useState<string | null>(null)

  if (devengos.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Ningún bono generó margen extra todavía: solo devengan los bonos con traslado parcial (traslado menor al
        monto del bono).
      </p>
    )
  }

  const marcas = [...MARCAS_FIJAS, ...new Set(devengos.map(d => d.marca).filter(m => !MARCAS_FIJAS.includes(m)))]

  const deMarca = marca ? devengos.filter(d => d.marca === marca) : devengos
  const delAnio = deMarca.filter(d => d.mes.startsWith(anio))

  // Gráfico: los 12 meses del año elegido, con lo devengado por la marca filtrada
  const porMes = new Map<string, number>()
  for (const d of delAnio) porMes.set(d.mes, (porMes.get(d.mes) ?? 0) + d.margenTotal)
  const dataChart = Array.from({ length: 12 }, (_, i) => {
    const m = `${anio}-${String(i + 1).padStart(2, '0')}`
    return { mes: m, label: mesCorto(m), total: porMes.get(m) ?? 0 }
  })

  const mesesConDatos = [...porMes.keys()].sort().reverse()
  const visibles = (mes ? delAnio.filter(d => d.mes === mes) : delAnio)
    .slice()
    .sort((a, b) => b.mes.localeCompare(a.mes) || b.margenTotal - a.margenTotal)

  const totalAnio = delAnio.reduce((acc, d) => acc + d.margenTotal, 0)
  const totalPeriodo = visibles.reduce((acc, d) => acc + d.margenTotal, 0)
  const unidadesPeriodo = visibles.reduce((acc, d) => acc + d.unidades, 0)
  const bonosPeriodo = new Set(visibles.map(d => d.bonoId)).size

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[null, ...marcas].map(m => (
          <button key={m ?? 'todas'} onClick={() => setMarca(m)} className={pill(marca === m)}>
            {m ?? 'Todas las marcas'}
          </button>
        ))}
        <span className="w-px h-6 bg-gray-200 mx-1" />
        {anios.map(a => (
          <button key={a} onClick={() => { setAnio(a); setMes(null) }} className={pill(anio === a)}>
            {a}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Tarjeta
          titulo={`Margen extra ${anio}`}
          valor={peso(totalAnio)}
          detalle={`Neto de IVA${marca ? ` · ${marca}` : ' · todas las marcas'}`}
          cls="text-violet-700"
        />
        <Tarjeta
          titulo={mes ? `Devengado en ${mesLabel(mes)}` : 'Período visible'}
          valor={peso(totalPeriodo)}
          detalle={`${unidadesPeriodo} unidades devengadas`}
        />
        <Tarjeta
          titulo="Bonos con margen extra"
          valor={String(bonosPeriodo)}
          detalle="Campañas con traslado parcial en el período"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Margen extra por mes {anio} (neto de IVA)</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataChart} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
              <YAxis stroke="#6b7280" fontSize={11} tickFormatter={v => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : peso(v))} width={70} />
              <Tooltip
                formatter={v => [peso(Number(v)), 'Margen extra']}
                labelFormatter={(_, payload) => (payload?.[0] ? mesLabel((payload[0].payload as { mes: string }).mes) : '')}
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e5e7eb' }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} cursor="pointer">
                {dataChart.map(d => (
                  <Cell
                    key={d.mes}
                    fill={mes === d.mes ? '#6d28d9' : '#8b5cf6'}
                    fillOpacity={mes && mes !== d.mes ? 0.35 : 1}
                    onClick={() => setMes(prev => (prev === d.mes ? null : d.mes))}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[null, ...mesesConDatos].map(m => (
          <button key={m ?? 'todos'} onClick={() => setMes(m)} className={pill(mes === m)}>
            {m ? mesLabel(m) : 'Todos los meses'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Mes</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Vigencia del bono</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Unidades</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Bono total</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Bono aplicado</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Margen/u</th>
              <th className="text-right px-4 py-3 font-medium text-violet-700 bg-violet-50">Margen extra</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.map(d => (
              <tr key={`${d.bonoId}-${d.mes}`} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-gray-900">{d.nombreModelo}</span>
                  <span className="block text-xs text-gray-400">{d.marca}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{mesLabel(d.mes)}</td>
                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                  {d.desde ? fechaCorta(d.desde) : '—'} → {d.hasta ? fechaCorta(d.hasta) : 'sin vto'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{d.unidades}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{peso(d.bonoTotal)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{peso(d.bonoAplicado)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{peso(d.margenUnitario)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-violet-800 bg-violet-50/40">{peso(d.margenTotal)}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-semibold ${ESTADO_BONO[d.estado].cls}`}>
                    {ESTADO_BONO[d.estado].label}
                  </span>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-400">
                  Sin margen extra devengado en el período elegido.
                </td>
              </tr>
            )}
          </tbody>
          {visibles.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-gray-700" colSpan={3}>Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-700">{unidadesPeriodo}</td>
                <td className="px-4 py-2.5" colSpan={3} />
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-violet-800 bg-violet-50/40">{peso(totalPeriodo)}</td>
                <td className="px-4 py-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Bono total = lo que la marca bonifica por unidad · Bono aplicado = lo que se trasladó al precio de venta
        (ambos $ c/IVA a nivel PVP) · Margen extra = (bono total − bono aplicado) ÷ 1,21 por unidad: la parte que
        queda para GOcelular, neta de IVA. Se devenga en el MES DE VENTA de cada unidad; con cupo, solo devengan
        las primeras unidades vendidas hasta agotarlo. Los bonos que trasladan todo el bono al precio no aparecen.
      </p>
    </div>
  )
}
