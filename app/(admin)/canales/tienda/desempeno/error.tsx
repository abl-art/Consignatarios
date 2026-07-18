'use client'

export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Error al cargar desempeño</h2>
        <p className="text-sm text-red-600 mb-4">{error.message || 'Error de servidor'}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
