'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AuditoriaTabs() {
  const pathname = usePathname()
  const tabs = [
    { href: '/auditorias/fisicas', label: 'Físicas' },
    { href: '/auditorias/auto', label: 'Auto' },
  ]
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map((t) => {
        const active = pathname?.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active ? 'border-magenta-600 text-magenta-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
