import Link from 'next/link'
import { fetchGrupoGoOperaciones, fetchGrupoGoChart } from '@/lib/actions/grupo-go'
import GrupoGoDashboardClient from './GrupoGoDashboardClient'
import GrupoGoChart from './GrupoGoChart'

export default async function GrupoGoDashboardPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string }
}) {
  const [data, chartData] = await Promise.all([
    fetchGrupoGoOperaciones(searchParams.desde, searchParams.hasta),
    fetchGrupoGoChart(searchParams.desde, searchParams.hasta),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <Link href="/grupo-go" className="text-gray-400 hover:text-gray-600 text-sm">← Grupo GO</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1 mt-2">Dashboard Grupo GO</h1>
      <p className="text-sm text-gray-500 mb-6">Operaciones por modelo de negocio</p>

      <GrupoGoDashboardClient data={data} desde={searchParams.desde} hasta={searchParams.hasta} chartData={chartData} />
    </div>
  )
}
