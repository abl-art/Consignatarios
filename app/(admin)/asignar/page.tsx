import { createClient } from '@/lib/supabase/server'
import type { Consignatario, DispositivoConModelo, Config } from '@/lib/types'
import AsignarForm from './AsignarForm'

export default async function AsignarPage() {
  const supabase = createClient()

  const [
    { data: consignatarios },
    { data: dispositivos },
    { data: config },
  ] = await Promise.all([
    supabase
      .from('consignatarios')
      .select('*')
      .order('nombre')
      .returns<Consignatario[]>(),
    supabase
      .from('dispositivos')
      .select('*, modelos(*)')
      .eq('estado', 'disponible')
      .order('created_at', { ascending: false })
      .returns<DispositivoConModelo[]>(),
    supabase
      .from('config')
      .select('*')
      .limit(1)
      .single<Config>(),
  ])

  const multiplicador = config?.multiplicador ?? 1.8

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Asignar stock</h1>
        <p className="text-sm text-gray-500 mt-1">
          Seleccioná equipos disponibles para entregar a un consignatario
        </p>
      </div>

      <AsignarForm
        consignatarios={consignatarios ?? []}
        dispositivos={dispositivos ?? []}
        multiplicador={multiplicador}
      />
    </div>
  )
}
