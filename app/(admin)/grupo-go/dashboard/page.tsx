import Link from 'next/link'
import { fetchGrupoGoOperaciones, fetchGrupoGoChart, fetchTopClientes } from '@/lib/actions/grupo-go'
import GrupoGoDashboardClient from './GrupoGoDashboardClient'
import GrupoGoChart from './GrupoGoChart'
import TopClientesTable from './TopClientesTable'

export default async function GrupoGoDashboardPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; cdesde?: string; chasta?: string }
}) {
  // Default to current year start
  const defaultDesde = `${new Date().getFullYear()}-01-01`
  const desde = searchParams.desde ?? defaultDesde
  const hasta = searchParams.hasta

  // Tabla de clientes: default últimos 30 días
  const hace30 = new Date()
  hace30.setDate(hace30.getDate() - 30)
  const cdesde = searchParams.cdesde ?? hace30.toISOString().slice(0, 10)
  const chasta = searchParams.chasta

  const [data, chartData, topClientes] = await Promise.all([
    fetchGrupoGoOperaciones(desde, hasta),
    fetchGrupoGoChart(desde, hasta),
    fetchTopClientes(cdesde, chasta),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/grupo-go" className="text-gray-400 hover:text-gray-600 text-sm">← Grupo GO</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Dashboard Grupo GO</h1>
      <p className="text-sm text-gray-500 mb-6">Operaciones por modelo de negocio</p>

      <GrupoGoDashboardClient data={data} desde={desde} hasta={hasta} chartData={chartData} />

      <div className="mt-8">
        <TopClientesTable rows={topClientes} cdesde={cdesde} chasta={chasta} />
      </div>
    </div>
  )
}
