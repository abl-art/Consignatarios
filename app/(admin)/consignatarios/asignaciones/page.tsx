import { createAdminClient } from '@/lib/supabase/admin'
import AsignacionesTabs from './AsignacionesTabs'

export default async function AsignacionesPage() {
  const admin = createAdminClient()

  const { data: allAsignaciones } = await admin
    .from('asignaciones')
    .select('id, consignatario_id, fecha, total_unidades, total_valor_costo, total_valor_venta, firmado_por, firma_url, consignatarios(nombre), asignacion_items(dispositivo_id, dispositivos(imei, modelos(marca, modelo)))')
    .order('fecha', { ascending: false })

  type Asignacion = {
    id: string
    consignatario_id: string
    fecha: string
    total_unidades: number
    total_valor_costo: number
    total_valor_venta: number
    firmado_por: string | null
    firma_url: string | null
    consignatarios: { nombre: string } | null
    asignacion_items: { dispositivo_id: string; dispositivos: { imei: string; modelos: { marca: string; modelo: string } | null } | null }[]
  }

  const asignaciones = (allAsignaciones ?? []) as unknown as Asignacion[]
  const borradores = asignaciones.filter(a => !a.firma_url)
  const confirmados = asignaciones.filter(a => !!a.firma_url)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Asignaciones</h1>
      <p className="text-sm text-gray-500 mb-6">Borradores pendientes de entrega y asignaciones confirmadas</p>

      <AsignacionesTabs borradores={borradores} confirmados={confirmados} />
    </div>
  )
}
