import { formatearMoneda } from '@/lib/utils'
import { fetchFlujoDeFondos, fetchAsistencias, fetchEgresos, fetchCuotasStats, fetchEgresosStats, getProyeccionDiaria, fetchPDIndicadores, fetchDPDIndicadores, fetchVintageAnalysis } from '@/lib/actions/finanzas'
import { simularDeuda } from '@/lib/simular-deuda'
import { fetchPrestamos, fetchMovimientos, getDeudaConfig, fetchInteresesPagadosMes } from '@/lib/actions/deuda'
import { CargarAsistenciaButton, CargarEgresoButton, ProyeccionButton } from './FinanzasActions'
import FinanzasManual from './FinanzasManual'
import FinanzasTabs from './FinanzasTabs'
import EgresosChart from './EgresosChart'
import CashBalanceChart from './CashBalanceChart'
import IndicadoresTab from './IndicadoresTab'
import DPDTab from './DPDTab'
import VintageTab from './VintageTab'
import DeudaTab from './DeudaTab'
import DeudaAlerts from './DeudaAlerts'
import DeudaBalanceChart from './DeudaBalanceChart'
import SimuladorTab from './SimuladorTab'
import ListaPreciosTab from './ListaPreciosTab'
import { fetchProductos } from '@/lib/actions/productos'

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const now = new Date()
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const mesSeleccionado = searchParams.mes || defaultMes

  const [allFlujoBase, asistencias, egresosRaw, cuotasStats, egresosStats, proyeccionDiaria, pdIndicadores, dpdIndicadores, vintageData, prestamos, todosMovimientos, deudaConfig, interesesMes, productosFinancieros] = await Promise.all([
    fetchFlujoDeFondos(),
    fetchAsistencias(),
    fetchEgresos(),
    fetchCuotasStats(),
    fetchEgresosStats(),
    getProyeccionDiaria(),
    fetchPDIndicadores(),
    fetchDPDIndicadores(),
    fetchVintageAnalysis(),
    fetchPrestamos(),
    fetchMovimientos(),
    getDeudaConfig(),
    fetchInteresesPagadosMes(),
    fetchProductos(),
  ])

  // Simular deuda sobre el flujo base
  const { flujo: allFlujo, alertas: deudaAlertas, diasEstres } = simularDeuda(allFlujoBase, prestamos, deudaConfig)

  // Filter by selected month (show selected month + 6 months forward)
  const mesStart = mesSeleccionado + '-01'
  const endDate = new Date(parseInt(mesSeleccionado.split('-')[0]), parseInt(mesSeleccionado.split('-')[1]) - 1 + 7, 0)
  const mesEnd = endDate.toISOString().slice(0, 10)
  const flujo = allFlujo.filter(r => r.cash_date >= mesStart && r.cash_date <= mesEnd)

  // Build month selector options (12 months back, 6 forward)
  const meses: string[] = []
  for (let i = -12; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatFecha = (fecha: string) => {
    const d = new Date(fecha + 'T12:00:00')
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const fmtCompact = (v: number) => {
    if (v === 0) return ''
    const abs = Math.abs(v)
    const sign = v < 0 ? '-' : ''
    if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M'
    if (abs >= 1_000) return sign + Math.round(abs / 1_000) + 'K'
    return sign + Math.round(abs).toString()
  }

  // Flujo tab content
  const flujoTab = (
    <div>
      {/* Cuotas vencidas stats - individual cards */}
      <p className="text-xs text-gray-400 mb-2">Cuotas vencidas: {cuotasStats.total.toLocaleString('es-AR')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">Adelantado</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-emerald-600">{cuotasStats.pct_adelantado.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.adelantado.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-emerald-700 mt-1">{formatearMoneda(cuotasStats.monto_adelantado)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">En término</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-green-600">{cuotasStats.pct_en_termino.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.en_termino.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-green-700 mt-1">{formatearMoneda(cuotasStats.monto_en_termino)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">Recupero de mora</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-yellow-600">{cuotasStats.pct_atrasado.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.atrasado.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-yellow-700 mt-1">{formatearMoneda(cuotasStats.monto_atrasado)}</p>
          <p className="text-xs text-gray-500 mt-1">PPP Recupero: <span className="font-bold text-gray-700">{cuotasStats.ppp_recupero} días</span></p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">En mora</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-red-600">{cuotasStats.pct_mora.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.mora.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-red-700 mt-1">{formatearMoneda(cuotasStats.monto_mora)}</p>
          <p className="text-xs text-gray-500 mt-1">PPP Mora: <span className="font-bold text-red-700">{cuotasStats.ppp_mora} días</span></p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-0.5">Contracargos (cuota 1)</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold text-red-700">{cuotasStats.pct_contracargos.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">{cuotasStats.contracargos.toLocaleString('es-AR')} cuotas</p>
          </div>
          <p className="text-sm font-semibold text-red-700 mt-1">{formatearMoneda(cuotasStats.monto_contracargos)}</p>
          <p className="text-xs text-red-500 mt-1">Incobrable</p>
        </div>
      </div>

      {/* Cash balance chart */}
      <CashBalanceChart data={flujo.map(r => ({ cash_date: r.cash_date, cash_balance: r.cash_balance }))} />
      <DeudaBalanceChart data={flujo.map(r => ({ cash_date: r.cash_date, cash_balance: r.cash_balance }))} prestamos={prestamos} limite={deudaConfig.limite} />

      {/* Action buttons and filter */}
      <div className="flex flex-wrap gap-3 items-end mb-6">
        <CargarAsistenciaButton />
        <CargarEgresoButton />
        <ProyeccionButton valorActual={proyeccionDiaria} />
        <form method="GET" className="flex items-end gap-3 ml-auto">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Mes</label>
            <select
              name="mes"
              defaultValue={mesSeleccionado}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {meses.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            Filtrar
          </button>
        </form>
      </div>

      {/* Cash flow table */}
      {flujo.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Sin datos de flujo de fondos para este período.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
          <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
            <table className="w-full table-fixed" style={{ fontSize: '10px' }}>
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-0.5 py-1.5 font-semibold text-gray-500 w-[38px]">Fecha</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-green-600">Adel</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-green-600">Térm</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-green-600">Atr</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-green-600">Pend</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-green-600">Asist</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-blue-500">Proy</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">Cel</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">Lic</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">Dsc</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">Suel</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">Env</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">Int</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">Otr</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">V3</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-red-600">DCp</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-gray-700">Neto</th>
                  <th className="text-right px-0.5 py-1.5 font-semibold text-gray-700">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {flujo.map((row, i) => {
                  const hoy = new Date().toISOString().slice(0, 10)
                  const esHoy = row.cash_date === hoy
                  return (
                  <tr key={i} className={`hover:bg-gray-50 ${esHoy ? 'bg-yellow-100' : ''}`}>
                    <td className="px-0.5 py-0.5 text-gray-700 font-medium whitespace-nowrap">{formatFecha(row.cash_date)}</td>
                    <td className="px-0.5 py-0.5 text-right text-green-700">{fmtCompact(row.in_adelantado)}</td>
                    <td className="px-0.5 py-0.5 text-right text-green-700">{fmtCompact(row.in_en_termino)}</td>
                    <td className="px-0.5 py-0.5 text-right text-green-700">{fmtCompact(row.in_atrasado)}</td>
                    <td className="px-0.5 py-0.5 text-right text-green-700">{fmtCompact(row.in_pendiente)}</td>
                    <td className="px-0.5 py-0.5 text-right text-green-700">{fmtCompact(row.in_asistencia)}</td>
                    <td className="px-0.5 py-0.5 text-right text-blue-600">{fmtCompact(row.in_proyectado)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_celulares)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_licencias)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_descartables)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_sueldos)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_envios)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_interes)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_otros)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_vta3ero)}</td>
                    <td className="px-0.5 py-0.5 text-right text-red-700">{fmtCompact(row.out_dev_capital)}</td>
                    <td className={`px-0.5 py-0.5 text-right font-bold ${row.net_flow >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtCompact(row.net_flow)}</td>
                    <td className={`px-0.5 py-0.5 text-right font-bold ${row.cash_balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtCompact(row.cash_balance)}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual entries */}
      <FinanzasManual asistencias={asistencias} egresos={egresosRaw} />
    </div>
  )

  // Egresos tab content
  const egresosTab = (
    <div>
      {/* Breakdown by concepto */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Desglose por concepto</h3>
        <div className="space-y-3">
          {egresosStats.breakdown.map((item) => (
            <div key={item.concepto} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-24">{item.concepto}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${Math.min(item.porcentaje, 100)}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-600 w-12 text-right">{item.porcentaje.toFixed(1)}%</span>
              <span className="text-xs font-bold text-red-700 w-28 text-right">{formatearMoneda(item.monto)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Egresos mensuales</h3>
        <EgresosChart data={egresosStats.mensual} />
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Finanzas</h1>
      <p className="text-sm text-gray-500 mb-6">Flujo de fondos y control de caja</p>

      <DeudaAlerts alertas={deudaAlertas} />

      <FinanzasTabs
        tabs={[
          { id: 'flujo', label: diasEstres.length > 0 ? `Flujo de fondos (${diasEstres.length} estrés)` : 'Flujo de fondos', content: flujoTab },
          { id: 'egresos', label: 'Egresos', content: egresosTab },
          { id: 'deuda', label: 'Deuda', content: <DeudaTab prestamos={prestamos} movimientos={todosMovimientos} config={deudaConfig} interesesMes={interesesMes} /> },
          { id: 'indicadores', label: 'Payment Defaults', content: <IndicadoresTab byOrigination={pdIndicadores.byOrigination} byDueMonth={pdIndicadores.byDueMonth} resumen={pdIndicadores.resumen} maxCuota={pdIndicadores.maxCuota} /> },
          { id: 'dpd', label: 'Days Past Due', content: <DPDTab byOrigination={dpdIndicadores.byOrigination} byDueMonth={dpdIndicadores.byDueMonth} /> },
          { id: 'vintage', label: 'Vintage', content: <VintageTab data={vintageData} /> },
          { id: 'simulador', label: 'Productos y Simulación', content: <SimuladorTab productos={productosFinancieros} /> },
          { id: 'precios', label: 'Lista de Precios', content: <ListaPreciosTab productos={productosFinancieros} /> },
        ]}
      />
    </div>
  )
}
