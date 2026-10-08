export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import ReglasCompatibilidad from './ReglasCompatibilidad'

const VALID_TOKEN = 'catalogo2026go'

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  if (searchParams.token !== VALID_TOKEN) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">GOcelular — ¿Qué equipos se pueden vender?</h1>
          <p className="text-xs text-gray-500">
            Reglas por marca con ejemplos de qué equipos son compatibles.
          </p>
        </div>
      </div>
      <div className="max-w-5xl mx-auto p-6">
        <ReglasCompatibilidad />
      </div>
    </div>
  )
}
