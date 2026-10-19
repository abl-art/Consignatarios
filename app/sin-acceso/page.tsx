export default function SinAccesoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-gray-100 text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Sin accesos</h1>
        <p className="text-sm text-gray-500 mb-6">
          No tenés accesos asignados. Contactá al administrador.
        </p>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
