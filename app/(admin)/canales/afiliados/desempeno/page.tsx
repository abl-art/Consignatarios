export const dynamic = 'force-dynamic'
import { fetchDesempenoAfiliados } from '@/lib/actions/afiliados-desempeno'
import DesempenoClient from './DesempenoClient'

export default async function DesempenoPage() {
  const data = await fetchDesempenoAfiliados(30)
  return <DesempenoClient data={data} />
}
