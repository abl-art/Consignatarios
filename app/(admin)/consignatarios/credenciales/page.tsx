import { createAdminClient } from '@/lib/supabase/admin'
import CredencialesClient from './CredencialesClient'

export const dynamic = 'force-dynamic'

export default async function CredencialesPage() {
  const admin = createAdminClient()

  const [{ data: consigs }, { data: credsConfig }] = await Promise.all([
    admin.from('consignatarios').select('id, nombre, email'),
    admin.from('flujo_config').select('value').eq('key', 'credenciales_consignatarios').single(),
  ])

  const passwords: Record<string, string> = credsConfig?.value ? JSON.parse(credsConfig.value) : {}

  const credenciales = (consigs ?? []).map((c: { id: string; nombre: string; email: string }) => ({
    id: c.id,
    nombre: c.nombre,
    email: c.email,
    password: passwords[c.id] || '',
  }))

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Credenciales</h1>
      <p className="text-sm text-gray-500 mb-6">Usuarios y contraseñas de consignatarios</p>

      <CredencialesClient credenciales={credenciales} />
    </div>
  )
}
