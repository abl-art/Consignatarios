import { createClient } from '@/lib/supabase/server'
import type { Consignatario, DispositivoConModelo } from '@/lib/types'
import { fetchInventarioDisponible } from '@/lib/gocelular'
import { getBorradores } from '@/lib/actions/asignar'
import AsignarForm from './AsignarForm'
import BorradoresList from './BorradoresList'

export default async function AsignarPage() {
  const supabase = createClient()

  const [
    { data: consignatarios },
    inventarioGo,
    { data: asignados },
    { data: diferencias },
    borradores,
  ] = await Promise.all([
    supabase
      .from('consignatarios')
      .select('*')
      .order('nombre')
      .returns<Consignatario[]>(),
    fetchInventarioDisponible(),
    supabase
      .from('dispositivos')
      .select('consignatario_id, modelos(precio_costo)')
      .eq('estado', 'asignado'),
    supabase
      .from('diferencias')
      .select('monto_deuda, auditorias(consignatario_id)')
      .eq('estado', 'pendiente'),
    getBorradores(),
  ])

  // Transform GOcelular inventory to DispositivoConModelo format
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

  // Build compromisoMap: sum precio_costo from assigned devices + monto_deuda from pending diferencias
  const compromisoMap: Record<string, number> = {}

  for (const row of asignados ?? []) {
    const cid = row.consignatario_id as string | null
    if (!cid) continue
    const costo = (row.modelos as unknown as { precio_costo: number } | null)?.precio_costo ?? 0
    compromisoMap[cid] = (compromisoMap[cid] ?? 0) + costo
  }

  for (const row of diferencias ?? []) {
    const auditoria = row.auditorias as unknown as { consignatario_id: string | null } | null
    const cid = auditoria?.consignatario_id ?? null
    if (!cid) continue
    compromisoMap[cid] = (compromisoMap[cid] ?? 0) + (row.monto_deuda ?? 0)
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Asignar stock</h1>
        <p className="text-sm text-gray-500 mt-1">
          Preparar equipos en depósito — confirmar con firma al entregar
        </p>
      </div>

      {/* Borradores pendientes */}
      {borradores.length > 0 && (
        <div className="mb-8">
          <BorradoresList borradores={borradores} />
        </div>
      )}

      <AsignarForm
        consignatarios={consignatarios ?? []}
        dispositivos={dispositivos}
        compromisoMap={compromisoMap}
      />
    </div>
  )
}
