export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { TOKEN_DENUNCIA } from '@/lib/seguros'
import DenunciaForm from '@/components/seguros/DenunciaForm'

// Formulario público de denuncia de robo (/denuncia-robo?token=...). Mismo
// patrón de token fijo por query que /catalogo, pero acá un token
// faltante/incorrecto devuelve 404 en vez de redirigir a /login (esta página
// no tiene nada que ver con el login de empleados — es de cara al cliente
// final, que nunca tendría una cuenta en el sistema).
export default function DenunciaRoboPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token !== TOKEN_DENUNCIA) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {/* /logo.png pasa el middleware sin login (matcher deja pasar .png) */}
          <img src="/logo.png" alt="GOcelular" className="h-9 w-auto" />
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
              <span aria-hidden>🛡️</span> Denuncia de robo
            </h1>
            <p className="text-xs text-gray-500">
              Completá este formulario para iniciar tu denuncia. Te contactamos dentro de las 48 horas hábiles.
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 max-w-md mx-auto w-full p-4">
        <DenunciaForm token={TOKEN_DENUNCIA} />
      </div>
    </div>
  )
}
