'use client'

import { useMemo, useState } from 'react'
import { forecastCompras, type FilaForecast, type ItemVentaForecast } from '@/lib/forecast-compras'
import { marcaDeModelo } from '@/lib/marca'
import type { ReposicionModelo } from '@/lib/inventario-indicadores'
import type { MesProyeccionPropia } from '@/lib/actions/proyecciones'

type Metodo = 'hibrido' | 'gocuotas'

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

interface Props {
  celulares: ItemVentaForecast[]
  addons: ItemVentaForecast[]
  reposiciones: ReposicionModelo[]
  proyeccion: { runMes: string; porMetodo: Record<Metodo, MesProyeccionPropia[]> }
}

const etiquetaMes = (m: MesProyeccionPropia) =>
  `${m.restoDelMes ? 'Resto ' : ''}${MESES_CORTOS[Number(m.mes.slice(5)) - 1]} ${m.mes.slice(2, 4)}`

function TablaForecast({ titulo, filas, meses }: { titulo: string; filas: FilaForecast[]; meses: MesProyeccionPropia[] }) {
  if (filas.length === 0) return null
  const totalPorMes = meses.map((_, i) => filas.reduce((s, f) => s + f.aComprar[i].unidades, 0))
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <h2 className="px-4 pt-4 text-sm font-semibold text-gray-900">{titulo}</h2>
      <table className="w-full text-sm mt-2">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="px-4 py-2.5 font-medium">Modelo</th>
            <th className="px-3 py-2.5 font-medium text-right">Ventas 30d</th>
            <th className="px-3 py-2.5 font-medium text-right">% mix</th>
            <th className="px-3 py-2.5 font-medium text-right">Pipeline</th>
            {meses.map((m) => (
              <th key={m.mes} className="px-3 py-2.5 font-medium text-right whitespace-nowrap">
                {etiquetaMes(m)}
              </th>
            ))}
            <th className="px-4 py-2.5 font-medium text-right">A comprar</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const primerMesConCompra = f.aComprar.findIndex((c) => Math.ceil(c.unidades) > 0)
            return (
              <tr key={f.modelo} className="border-b border-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{f.modelo}</td>
                <td className="px-3 py-2 text-right text-gray-600">{Math.round(f.ventas30d).toLocaleString('es-AR')}</td>
                <td className="px-3 py-2 text-right text-gray-500">{f.sharePct.toFixed(1)}%</td>
                <td className="px-3 py-2 text-right text-gray-600">{f.pipeline.toLocaleString('es-AR')}</td>
                {f.aComprar.map((c, i) => {
                  const unidades = Math.ceil(c.unidades)
                  return (
                    <td
                      key={c.mes}
                      title={`Demanda proyectada: ${Math.round(f.demanda[i].unidades)} u`}
                      className={`px-3 py-2 text-right ${
                        unidades > 0
                          ? i === primerMesConCompra
                            ? 'font-semibold text-amber-700 bg-amber-50'
                            : 'font-medium text-gray-900'
                          : 'text-gray-300'
                      }`}
                    >
                      {unidades > 0 ? unidades.toLocaleString('es-AR') : '—'}
                    </td>
                  )
                })}
                <td className="px-4 py-2 text-right font-semibold text-gray-900">
                  {Math.ceil(f.totalAComprar) > 0 ? Math.ceil(f.totalAComprar).toLocaleString('es-AR') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 text-xs text-gray-600">
            <td className="px-4 py-2.5 font-semibold" colSpan={4}>
              Total
            </td>
            {totalPorMes.map((t, i) => (
              <td key={meses[i].mes} className="px-3 py-2.5 text-right font-semibold">
                {Math.ceil(t) > 0 ? Math.ceil(t).toLocaleString('es-AR') : '—'}
              </td>
            ))}
            <td className="px-4 py-2.5 text-right font-semibold">
              {Math.ceil(totalPorMes.reduce((a, b) => a + b, 0)).toLocaleString('es-AR')}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function ForecastClient({ celulares, addons, reposiciones, proyeccion }: Props) {
  const [metodo, setMetodo] = useState<Metodo>('hibrido')
  const [marca, setMarca] = useState('')

  const meses = proyeccion.porMetodo[metodo]
  const forecast = useMemo(
    () => forecastCompras(celulares, addons, reposiciones, meses.map((m) => ({ mes: m.mes, unidades: m.unidades }))),
    [celulares, addons, reposiciones, meses]
  )

  // El share % se calcula sobre el mix completo; el filtro solo recorta filas
  const marcas = useMemo(() => {
    const set = new Set([...forecast.celulares, ...forecast.addons].map((f) => marcaDeModelo(f.modelo)))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [forecast])
  const porMarca = (filas: FilaForecast[]) => (marca ? filas.filter((f) => marcaDeModelo(f.modelo) === marca) : filas)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(
            [
              { id: 'hibrido', label: 'Híbrido' },
              { id: 'gocuotas', label: 's/GOcuotas' },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              onClick={() => setMetodo(o.id)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                metodo === o.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setMarca('')}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              marca === '' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todas
          </button>
          {marcas.map((m) => (
            <button
              key={m}
              onClick={() => setMarca(marca === m ? '' : m)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                marca === m ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Run {proyeccion.runMes} · proyección propia:{' '}
          {meses.map((m) => `${etiquetaMes(m)} ${Math.round(m.unidades).toLocaleString('es-AR')}`).join(' · ')}
        </p>
      </div>

      <TablaForecast titulo="Celulares" filas={porMarca(forecast.celulares)} meses={meses} />
      <TablaForecast titulo="Addons" filas={porMarca(forecast.addons)} meses={meses} />

      <p className="text-xs text-gray-400">
        Demanda = venta 30d del modelo × (proyección del mes ÷ {Math.round(forecast.baselineMensual).toLocaleString('es-AR')}{' '}
        celulares/mes del baseline). A comprar = demanda acumulada − pipeline, imputada al mes en que el pipeline se agota (en
        ámbar: cuándo gatillar el pedido). El mix se asume estable; los addons mantienen su attach sobre el volumen de celulares.
        Kits afuera — siguen con la cobertura de Inventario.
      </p>
    </div>
  )
}
