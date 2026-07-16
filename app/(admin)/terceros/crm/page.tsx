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
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/terceros"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Terceros
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">CRM — Pipeline GOcelulares</h1>
      </div>

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
