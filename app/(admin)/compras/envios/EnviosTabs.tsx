'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface Tab {
  id: string
  label: string
  content: ReactNode
}

export default function EnviosTabs({ tabs }: { tabs: Tab[] }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tabParam = searchParams.get('tab')
  const [active, setActive] = useState(tabParam && tabs.some(t => t.id === tabParam) ? tabParam : tabs[0]?.id ?? '')

  // La pestaña activa vive también en la URL: un refresh (p. ej. tras cargar
  // un siniestro) no te devuelve a la primera pestaña
  const elegir = (id: string) => {
    setActive(id)
    router.replace(`${pathname}?tab=${id}`, { scroll: false })
  }

  useEffect(() => {
    if (tabParam && tabs.some(t => t.id === tabParam)) {
      setActive(tabParam)
    }
  }, [tabParam, tabs])

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => elegir(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-magenta-600 text-magenta-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} className={active === tab.id ? '' : 'hidden'}>
          {tab.content}
        </div>
      ))}
    </div>
  )
}
