import { createClient } from '@/lib/supabase/server'
import type { Consignatario, DispositivoConModelo } from '@/lib/types'
import NuevaAuditoriaForm from './NuevaAuditoriaForm'

export default async function NuevaAuditoriaPage() {
  const supabase = createClient()

  const [{ data: consignatarios }, { data: dispositivos }] = await Promise.all([
    supabase
      .from('consignatarios')
      .select('*')
      .order('nombre')
      .returns<Consignatario[]>(),
    supabase
      .from('dispositivos')
      .select('*, modelos(*)')
      .eq('estado', 'asignado')
      .returns<DispositivoConModelo[]>(),
  ])

  const dispositivosPorConsignatario = (dispositivos ?? []).reduce<Record<string, DispositivoConModelo[]>>(
    (acc, d) => {
      if (d.consignatario_id) {
        if (!acc[d.consignatario_id]) acc[d.consignatario_id] = []
        acc[d.consignatario_id].push(d)
      }
      return acc
    },
    {}
  )

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Nueva auditoría</h1>
        <p className="text-sm text-gray-500 mt-1">
          Escaneá los dispositivos presentes y confirmá o guardá como borrador.
        </p>
      </div>

      <NuevaAuditoriaForm
        consignatarios={consignatarios ?? []}
        dispositivosPorConsignatario={dispositivosPorConsignatario}
      />
    </div>
  )
}
