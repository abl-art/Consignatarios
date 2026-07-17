import Link from 'next/link'
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
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/auditorias" className="text-gray-400 hover:text-gray-600 text-sm">← Auditorías</Link>
        <span className="text-gray-300 text-sm">/</span>
        <Link href="/canales" className="text-gray-400 hover:text-gray-600 text-sm">← Canales</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nueva auditoría</h1>
      <p className="text-sm text-gray-500 mb-6">
        Escaneá los dispositivos presentes y confirmá o guardá como borrador.
      </p>

      <NuevaAuditoriaForm
        consignatarios={consignatarios ?? []}
        dispositivosPorConsignatario={dispositivosPorConsignatario}
      />
    </div>
  )
}
