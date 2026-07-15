import { createAdminClient } from '@/lib/supabase/admin'
import { getProformasConfirmadas } from '@/lib/actions/proformas'
import { fetchInventarioDisponible } from '@/lib/gocelular'
import AsignacionesTabs from './AsignacionesTabs'
import type { DispositivoConModelo } from '@/lib/types'

export default async function AsignacionesPage() {
  const admin = createAdminClient()

  const [{ data: allAsignaciones }, proformasConfirmadas, inventarioGo] = await Promise.all([
    admin
      .from('asignaciones')
      .select('id, consignatario_id, proforma_id, fecha, total_unidades, total_valor_costo, total_valor_venta, firmado_por, firma_url, consignatarios(nombre), asignacion_items(dispositivo_id, dispositivos(imei, modelos(marca, modelo)))')
      .order('fecha', { ascending: false }),
    getProformasConfirmadas(),
    fetchInventarioDisponible(),
  ])

  type Asignacion = {
    id: string
    consignatario_id: string | null
    proforma_id: string | null
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

  // Consignatarios: asignaciones sin proforma_id
  const consigBorradores = asignaciones.filter(a => !a.proforma_id && !a.firma_url)
  const consigConfirmados = asignaciones.filter(a => !a.proforma_id && !!a.firma_url)

  // Mayoristas: asignaciones con proforma_id
  const mayoristaBorradores = asignaciones.filter(a => !!a.proforma_id && !a.firma_url)
  const mayoristaConfirmados = asignaciones.filter(a => !!a.proforma_id && !!a.firma_url)

  // Inventario disponible para asignación mayorista
  const dispositivos: DispositivoConModelo[] = inventarioGo.map((item) => ({
    id: item.imei,
    imei: item.imei,
    estado: 'disponible' as const,
    modelo_id: item.model_code,
    consignatario_id: null,
    fecha_asignacion: null,
    created_at: new Date().toISOString(),
    modelos: {
      id: item.model_code,
      marca: item.brand,
      modelo: item.model_name,
      precio_costo: item.precio_costo,
      created_at: new Date().toISOString(),
    },
  }))

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Asignaciones</h1>
      <p className="text-sm text-gray-500 mb-6">Borradores pendientes de entrega y asignaciones confirmadas</p>

      <AsignacionesTabs
        consigBorradores={consigBorradores}
        consigConfirmados={consigConfirmados}
        mayoristaBorradores={mayoristaBorradores}
        mayoristaConfirmados={mayoristaConfirmados}
        proformasConfirmadas={proformasConfirmadas}
        dispositivos={dispositivos}
      />
    </div>
  )
}
