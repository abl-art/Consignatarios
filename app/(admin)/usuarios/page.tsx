import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/permisos-server'
import { listarUsuarios } from '@/lib/actions/usuarios'
import UsuariosTable from './UsuariosTable'

// El sidebar (Task 6) ya esconde este ítem para admins no-super, pero la
// página se protege igual por si entran por URL directa.
export default async function UsuariosPage() {
  try {
    await requireSuperAdmin()
  } catch {
    redirect('/dashboard')
  }

  const usuarios = await listarUsuarios()

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Usuarios y Permisos</h1>
      <p className="text-sm text-gray-500 mb-6">
        Alta de usuarios restringidos por invitación (mail @gocuotas.com), estado y resumen de accesos.
        Solo visible para super admins.
      </p>
      <UsuariosTable usuarios={usuarios} />
    </div>
  )
}
