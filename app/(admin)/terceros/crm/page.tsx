export const dynamic = 'force-dynamic'

import Link from 'next/link'
import FinanzasTabs from '@/app/(admin)/finanzas/FinanzasTabs'
import PipelineTab from './PipelineTab'
import ConversionTab from './ConversionTab'
import ReunionesTab from './ReunionesTab'
import { fetchPipelineData, fetchConversionData, fetchMeetingsData } from '@/lib/actions/crm-keycontact'

function daysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function today(): string { return new Date().toISOString().slice(0, 10) }

export default async function CRMPage() {
  const desde = daysAgo(30)
  const hasta = today()

  const [pipelineData, conversionData, meetingsData] = await Promise.all([
    fetchPipelineData(desde, hasta),
    fetchConversionData(desde, hasta),
    fetchMeetingsData(desde, hasta),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/terceros" className="text-gray-400 hover:text-gray-600 text-sm">← Terceros</Link>
        <span className="text-gray-300 text-sm">/</span>
        <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">← Canales</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">CRM — Pipeline GOcelulares</h1>
      <p className="text-sm text-gray-500 mb-6">Pipeline de ventas por canal</p>

      <FinanzasTabs tabs={[
        {
          id: 'pipeline',
          label: 'Pipeline',
          content: <PipelineTab data={pipelineData} owners={pipelineData.owners} />,
        },
        {
          id: 'conversion',
          label: 'Conversión',
          content: <ConversionTab data={conversionData} />,
        },
        {
          id: 'reuniones',
          label: 'Reuniones',
          content: <ReunionesTab data={meetingsData} />,
        },
      ]} />
    </div>
  )
}
