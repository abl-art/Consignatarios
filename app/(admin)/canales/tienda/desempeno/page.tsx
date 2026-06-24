export const dynamic = 'force-dynamic'
import { fetchTiendaDesempeno } from '@/lib/actions/tienda-desempeno'
import TiendaDesempenoClient from './TiendaDesempenoClient'

export default async function TiendaDesempenoPage() {
  const hasta = new Date().toISOString().slice(0, 10)
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const data = await fetchTiendaDesempeno(desde, hasta)
  return <TiendaDesempenoClient data={data} desde={desde} hasta={hasta} />
}
