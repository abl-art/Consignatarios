'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Selector de tienda de la Lista de Precios (estado en ?tienda=, patrón
// CanalPills de Finanzas). GOcelular es el default histórico de la página.
const TIENDAS = [
  { id: 'gocelular', label: 'GOcelular' },
  { id: 'gomarket', label: 'GOmarket' },
] as const

export default function TiendaPills({ activa }: { activa: 'gocelular' | 'gomarket' }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const elegir = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString())
    if (id === 'gocelular') sp.delete('tienda')
    else sp.set('tienda', id)
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="flex items-center gap-1 mb-4">
      {TIENDAS.map(t => (
        <button
          key={t.id}
          onClick={() => elegir(t.id)}
          className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
            activa === t.id
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
