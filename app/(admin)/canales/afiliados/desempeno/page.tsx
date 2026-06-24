export const dynamic = 'force-dynamic'
import { fetchDesempenoAfiliados } from '@/lib/actions/afiliados-desempeno'
import DesempenoClient from './DesempenoClient'

export default async function DesempenoPage() {
  const hasta = new Date().toISOString().slice(0, 10)
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const data = await fetchDesempenoAfiliados(desde, hasta)
  return <DesempenoClient data={data} desde={desde} hasta={hasta} />
}
