import { formatearMoneda } from '@/lib/utils'
import { fetchFlujoDeFondosPorCanal, fetchAsistencias, fetchEgresos, fetchCuotasStats, fetchEgresosStats, getProyeccionDiaria, fetchPDIndicadores, fetchDPDIndicadores, fetchVintageAnalysis, getFiltrosTerceros, type FlujoDiario, type CuotasStats } from '@/lib/actions/finanzas'
import { simularDeuda } from '@/lib/simular-deuda'
import { fetchPrestamos, fetchMovimientos, getDeudaConfig, fetchInteresesPagadosMes } from '@/lib/actions/deuda'
import { fetchResultadoTienda } from '@/lib/actions/resultado'
import { fetchResultadoTerceros } from '@/lib/actions/resultado-terceros'
import ResultadoTab from './ResultadoTab'
import FinanzasManual from './FinanzasManual'
import FinanzasTabs from './FinanzasTabs'
import EgresosChart from './EgresosChart'
import FlujoTab from './FlujoTab'
import IndicadoresTab from './IndicadoresTab'
import DPDTab from './DPDTab'
import VintageTab from './VintageTab'
import DeudaTab from './DeudaTab'
import DeudaAlerts from './DeudaAlerts'
import SimuladorTab from './SimuladorTab'
import ProductosTab from './ProductosTab'
import { fetchProductos } from '@/lib/actions/productos'
import { getDatosSimulador } from '@/lib/actions/simulador-datos'
import { CLIENT_IDS_PROPIOS, CLIENTES_TERCEROS } from '@/lib/client-ids'

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: { mes?: string }
}) {
  const now = new Date()
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const mesSeleccionado = searchParams.mes || defaultMes

  const resultadoHasta = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const resultadoDesde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [flujoPorCanal, asistencias, egresosRaw, cuotasStats, egresosStats, proyeccionDiaria, pdIndicadores, dpdIndicadores, vintageData, prestamos, todosMovimientos, deudaConfig, interesesMes, productosFinancieros] = await Promise.all([
    fetchFlujoDeFondosPorCanal(),
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

  // Variantes por canal para las píldoras de PD/DPD/Vintage. Corren después del
  // Promise.all principal para no saturar el pool; si fallan, la píldora del canal
  // muestra vacío en vez de tirar la página.
  const PD_VACIO = { byOrigination: [], byDueMonth: [], resumen: [], maxCuota: 0 }
  const DPD_VACIO = { byOrigination: [], byDueMonth: [] }
  const [pdPropia, pdTerceros, dpdPropia, dpdTerceros, vintagePropia, vintageTerceros] = await Promise.all([
    fetchPDIndicadores(CLIENT_IDS_PROPIOS).catch(() => PD_VACIO),
    fetchPDIndicadores(CLIENTES_TERCEROS).catch(() => PD_VACIO),
    fetchDPDIndicadores(CLIENT_IDS_PROPIOS).catch(() => DPD_VACIO),
    fetchDPDIndicadores(CLIENTES_TERCEROS).catch(() => DPD_VACIO),
    fetchVintageAnalysis(CLIENT_IDS_PROPIOS).catch(() => []),
    fetchVintageAnalysis(CLIENTES_TERCEROS).catch(() => []),
  ])

  // Tarjetas de cuotas vencidas por canal (mismo criterio: después del pool
  // principal) + merchants/stores de terceros para los desplegables
  const CUOTAS_VACIO: CuotasStats = { total: 0, adelantado: 0, en_termino: 0, atrasado: 0, mora: 0, contracargos: 0, pct_adelantado: 0, pct_en_termino: 0, pct_atrasado: 0, pct_mora: 0, pct_contracargos: 0, monto_adelantado: 0, monto_en_termino: 0, monto_atrasado: 0, monto_mora: 0, monto_contracargos: 0, ppp_recupero: 0, ppp_mora: 0 }
  const [cuotasPropia, cuotasTerceros, merchantsTerceros] = await Promise.all([
    fetchCuotasStats(CLIENT_IDS_PROPIOS).catch(() => CUOTAS_VACIO),
    fetchCuotasStats(CLIENTES_TERCEROS).catch(() => CUOTAS_VACIO),
    getFiltrosTerceros().catch(() => []),
  ])

  // Datos del simulador: reusa el vintage/PD por canal ya fetcheado (prefetch) y
  // corre sus queries propias después. Si falla, arranca sin precargas.
  const SIN_DATOS_CANAL = { incobrabilidad_pct: null, fpd_pct: null, mora_dias: null, ticket_promedio: null }
  let datosSimulador: Awaited<ReturnType<typeof getDatosSimulador>>
  try {
    datosSimulador = await getDatosSimulador({
      vinPropia: vintagePropia,
      vinTerceros: vintageTerceros,
      pdPropia,
      pdTerceros,
    })
  } catch {
    datosSimulador = { propia: { ...SIN_DATOS_CANAL }, terceros: { ...SIN_DATOS_CANAL }, modelos: [] }
  }

  // Resultado runs after to avoid exhausting the connection pool
  let resultadoData: Awaited<ReturnType<typeof fetchResultadoTienda>>
  let resultadoTerceros: Awaited<ReturnType<typeof fetchResultadoTerceros>>
  try {
    resultadoData = await fetchResultadoTienda(resultadoDesde, resultadoHasta)
  } catch {
    resultadoData = { productos: [], config: { kit_seguridad: 7000, envio_fulfillment: 15000, licencias_bloqueo: 7500, sueldos: 1250, otros: 1000, adquirencia: 0.8, incobrables: 6.5, iibb: 4, com_e_ind: 1, tna: 27, plazo_pago_proveedor: 60, tipo_cambio: 1500 }, totals: { unidades: 0, unidades_main: 0, unidades_addon: 0, ganancia: 0, ganancia_usd: 0, revenue_neto: 0, costo_total: 0, kit: 0, envio: 0, licencias_bloqueo: 0, contribucion_bruta: 0, adquirencia: 0, incobrables: 0, sueldos: 0, otros_costo: 0, intereses: 0, impuestos: 0, contribucion_neta: 0 } }
  }
  try {
    resultadoTerceros = await fetchResultadoTerceros(resultadoDesde, resultadoHasta)
  } catch {
    resultadoTerceros = { merchants: [], config: { ...resultadoData.config, comision_terceros: 23, liquidacion_1_pct: 50, liquidacion_1_dias: 60, liquidacion_2_pct: 50, liquidacion_2_dias: 90 }, totals: { unidades: 0, order_amount_total: 0, revenue_gocuotas: 0, licencias_bloqueo: 0, sueldos: 0, adquirencia: 0, incobrables: 0, intereses: 0, impuestos: 0, contribucion_neta: 0, ganancia: 0, ganancia_usd: 0 } }
  }

  // Simular deuda sobre el flujo base. La deuda es del negocio propio: se
  // inyecta en Total y en Venta Propia; Terceros va sin deuda. Las alertas y
  // los días de estrés salen SIEMPRE de la corrida Total.
  const { flujo: allFlujo, alertas: deudaAlertas, diasEstres } = simularDeuda(flujoPorCanal.total, prestamos, deudaConfig)
  const { flujo: allFlujoPropia } = simularDeuda(flujoPorCanal.propia, prestamos, deudaConfig)

  // Filter by selected month (show selected month + 6 months forward)
  const mesStart = mesSeleccionado + '-01'
  const endDate = new Date(parseInt(mesSeleccionado.split('-')[0]), parseInt(mesSeleccionado.split('-')[1]) - 1 + 7, 0)
  const mesEnd = endDate.toISOString().slice(0, 10)
  const filtrarMes = (rows: FlujoDiario[]) => rows.filter(r => r.cash_date >= mesStart && r.cash_date <= mesEnd)
  const flujo = filtrarMes(allFlujo)
  const flujoPropia = filtrarMes(allFlujoPropia)
  const flujoTerceros = filtrarMes(flujoPorCanal.terceros)

  // Build month selector options (12 months back, 6 forward)
  const meses: string[] = []
  for (let i = -12; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Flujo tab content
  const flujoTab = (
    <div>
      <FlujoTab
        canales={{
          total: { flujo, stats: cuotasStats },
          propia: { flujo: flujoPropia, stats: cuotasPropia },
          terceros: { flujo: flujoTerceros, stats: cuotasTerceros },
        }}
        prestamos={prestamos}
        limiteDeuda={deudaConfig.limite}
        proyeccionDiaria={proyeccionDiaria}
        mesSeleccionado={mesSeleccionado}
        meses={meses}
      />

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
    <div className="p-4 md:p-6 max-w-full mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Finanzas</h1>
      <p className="text-sm text-gray-500 mb-6">Flujo de fondos y control de caja</p>

      <DeudaAlerts alertas={deudaAlertas} />

      <FinanzasTabs
        tabs={[
          { id: 'flujo', label: diasEstres.length > 0 ? `Flujo de fondos (${diasEstres.length} estrés)` : 'Flujo de fondos', content: flujoTab },
          { id: 'egresos', label: 'Egresos', content: egresosTab },
          { id: 'deuda', label: 'Deuda', content: <DeudaTab prestamos={prestamos} movimientos={todosMovimientos} config={deudaConfig} interesesMes={interesesMes} /> },
          { id: 'indicadores', label: 'Payment Defaults', content: <IndicadoresTab canales={{ total: pdIndicadores, propia: pdPropia, terceros: pdTerceros }} merchants={merchantsTerceros} /> },
          { id: 'dpd', label: 'Days Past Due', content: <DPDTab canales={{ total: dpdIndicadores, propia: dpdPropia, terceros: dpdTerceros }} merchants={merchantsTerceros} /> },
          { id: 'vintage', label: 'Vintage', content: <VintageTab canales={{ total: vintageData, propia: vintagePropia, terceros: vintageTerceros }} merchants={merchantsTerceros} /> },
          { id: 'simulador', label: 'Simulación', content: <SimuladorTab productos={productosFinancieros} datos={datosSimulador} /> },
          { id: 'precios', label: 'Productos', content: <ProductosTab productos={productosFinancieros} /> },
          { id: 'resultado', label: 'Resultado', content: <ResultadoTab data={resultadoData} dataTerceros={resultadoTerceros} desde={resultadoDesde} hasta={resultadoHasta} /> },
        ]}
      />
    </div>
  )
}
