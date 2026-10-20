import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/permisos-server'
import { getUsuario } from '@/lib/actions/usuarios'
import EditorPermisos from './EditorPermisos'
import SuperAdminToggle from './SuperAdminToggle'

// Ficha de permisos de un usuario (Task 9). Protegida igual que /usuarios:
// el sidebar ya esconde este ítem para no-super-admins, pero la página se
// protege igual por si entran por URL directa.
export default async function FichaUsuarioPage({ params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin()
  } catch {
    redirect('/dashboard')
  }

  let usuario
  try {
    usuario = await getUsuario(params.id)
  } catch {
    redirect('/usuarios')
  }

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/usuarios" className="text-sm text-gray-400 hover:text-gray-600">
        ← Volver a Usuarios
      </Link>

      <div className="flex items-center gap-3 mt-2 mb-1">
        <h1 className="text-xl font-semibold text-gray-900">{usuario.email}</h1>
        {usuario.activo ? (
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            Activo
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
            Inactivo
          </span>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-6">
        {usuario.superAdmin
          ? 'Super admin: tiene acceso a todo el panel sin importar los tildes de abajo. Los permisos quedan guardados igual, por si en algún momento deja de ser super admin.'
          : 'Marcá Ver y Operar por cada pestaña. Operar implica Ver. Sin tilde de Ver, el usuario no ve esa pestaña.'}
      </p>

      <SuperAdminToggle userId={params.id} superAdmin={usuario.superAdmin} />

      <EditorPermisos userId={params.id} permisosIniciales={usuario.permisos} />
    </div>
  )
}
