import { createAdminClient } from '@/lib/supabase/admin'
import DevolucionesClient from './DevolucionesClient'

export const dynamic = 'force-dynamic'

export default async function DevolucionesPage() {
  const admin = createAdminClient()

  // Get all assigned dispositivos with consignatario info
  const { data: asignados } = await admin
    .from('dispositivos')
    .select('id, imei, estado, fecha_asignacion, consignatario_id, consignatarios(nombre), modelos(marca, modelo)')
    .eq('estado', 'asignado')
    .order('fecha_asignacion', { ascending: false })

  // Get recent devoluciones — we need to find the last asignacion to know the consignatario
  const { data: devueltos } = await admin
    .from('dispositivos')
    .select('id, imei, estado, fecha_asignacion, created_at, modelos(marca, modelo), asignacion_items(asignacion_id, asignaciones(consignatario_id, consignatarios(nombre)))')
    .eq('estado', 'devuelto')
    .order('created_at', { ascending: false })
    .limit(50)

  type Asignado = {
    id: string
    imei: string
    estado: string
    fecha_asignacion: string | null
    consignatario_id: string
    consignatarios: { nombre: string } | null
    modelos: { marca: string; modelo: string } | null
  }

  type Devuelto = {
    id: string
    imei: string
    estado: string
    fecha_asignacion: string | null
    created_at: string
    modelos: { marca: string; modelo: string } | null
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Devoluciones</h1>
      <p className="text-sm text-gray-500 mb-6">Escanear o ingresar IMEI para devolver equipos al stock</p>

      <DevolucionesClient
        asignados={(asignados ?? []) as unknown as Asignado[]}
        devueltos={(devueltos ?? []).map((d: Record<string, unknown>) => {
          const items = d.asignacion_items as { asignaciones: { consignatarios: { nombre: string } | null } | null }[] | null
          const consigNombre = items?.[0]?.asignaciones?.consignatarios?.nombre || undefined
          return { id: d.id, imei: d.imei, estado: d.estado, fecha_asignacion: d.fecha_asignacion, created_at: d.created_at, modelos: d.modelos, consignatarioNombre: consigNombre } as unknown as Devuelto
        })}
      />
    </div>
  )
}
