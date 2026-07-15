export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { getClientesMayoristas } from '@/lib/actions/clientes-mayoristas'
import Link from 'next/link'
import CuentaCorrienteClient from './CuentaCorrienteClient'

export default async function CuentaCorrientePage() {
  const clientes = await getClientesMayoristas()
  const admin = createAdminClient()

  // Fetch all confirmed proformas with client info
  const { data: proformas } = await admin
    .from('proformas')
    .select('id, nro_proforma, cliente_mayorista_id, cliente_nombre, total_con_iva, fecha_confirmacion, estado')
    .eq('estado', 'confirmada')
    .not('cliente_mayorista_id', 'is', null)
    .order('fecha_confirmacion', { ascending: false })

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-8">
        <Link href="/mayoristas/clientes" className="text-gray-400 hover:text-gray-600">← Clientes</Link>
        <h1 className="text-2xl font-bold text-gray-900">Cuenta Corriente</h1>
      </div>

      <CuentaCorrienteClient
        clientes={clientes}
        proformas={(proformas ?? []) as { id: string; nro_proforma: number | null; cliente_mayorista_id: string; cliente_nombre: string; total_con_iva: number; fecha_confirmacion: string; estado: string }[]}
      />
    </div>
  )
}
