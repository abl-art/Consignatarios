import { fetchProspectos, fetchProspectoStats } from '@/lib/actions/crm-terceros'
import CRMClient from './CRMClient'

export default async function CRMPage() {
  const prospectos = await fetchProspectos()
  const stats = await fetchProspectoStats(prospectos)

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">CRM - Venta a Terceros</h1>
      <p className="text-sm text-gray-500 mb-6">Pipeline de prospectos comerciales</p>
      <CRMClient prospectos={prospectos} stats={stats} />
    </div>
  )
}
