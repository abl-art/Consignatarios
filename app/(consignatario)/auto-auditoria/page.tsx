import { createClient } from '@/lib/supabase/server'
import { getCurrentConsignatario } from '@/lib/consignatario-helpers'
import AutoAuditoriaForm from './AutoAuditoriaForm'
import type { DispositivoConModelo, Auditoria } from '@/lib/types'

export default async function AutoAuditoriaPage() {
  const consignatario = await getCurrentConsignatario()
  const supabase = createClient()

  const now = new Date()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inicioMes = `${mesActual}-01`

  const [{ data: dispositivos }, { data: yaHecha }] = await Promise.all([
    supabase.from('dispositivos').select('*, modelos(*)')
      .eq('consignatario_id', consignatario.id).eq('estado', 'asignado')
      .returns<DispositivoConModelo[]>(),
    supabase.from('auditorias').select('*')
      .eq('consignatario_id', consignatario.id)
      .eq('tipo', 'auto').eq('estado', 'confirmada')
      .gte('fecha', inicioMes).limit(1).returns<Auditoria[]>(),
  ])

  const completada = (yaHecha ?? []).length > 0
  const auditoriaHecha = (yaHecha ?? [])[0]

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Auto-auditoría — {mesActual}</h1>
      <p className="text-sm text-gray-500 mb-8">Escaneá todos tus equipos para confirmar tu stock del mes</p>

      {completada ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-lg font-semibold text-green-800 mb-2">Auto-auditoría del mes completada ✓</p>
          <p className="text-sm text-green-700 mb-4">Gracias. Tu pago está liberado (si no había diferencias).</p>
          {auditoriaHecha && (
            <a href={`/api/pdf/auditoria/${auditoriaHecha.id}`} target="_blank" rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700">
              Descargar acta firmada (PDF)
            </a>
          )}
        </div>
      ) : (dispositivos ?? []).length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-sm text-yellow-800">
          No tenés equipos asignados, no hay nada que auditar.
        </div>
      ) : (
        <AutoAuditoriaForm
          consignatarioId={consignatario.id}
          dispositivos={dispositivos ?? []}
        />
      )}
    </div>
  )
}
