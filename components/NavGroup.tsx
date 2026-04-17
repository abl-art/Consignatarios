'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import NavIcon, { type IconName } from '@/components/NavIcon'

interface NavChild {
  href: string
  label: string
  icon: IconName
}

export default function NavGroup({
  href,
  label,
  icon,
  children,
}: {
  href: string
  label: string
  icon: IconName
  children: NavChild[]
}) {
  const pathname = usePathname()
  const isChildActive = children.some((c) => pathname.startsWith(c.href))
  const [open, setOpen] = useState(pathname.startsWith(href) || isChildActive)

  return (
    <div>
      <div className="flex items-center">
        <Link
          href={href}
          className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors"
        >
          <NavIcon name={icon} />
          <span>{label}</span>
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-45' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-200 pl-2">
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                pathname.startsWith(child.href)
                  ? 'bg-magenta-50 text-magenta-700'
                  : 'text-gray-500 hover:bg-magenta-50 hover:text-magenta-700'
              }`}
            >
              <NavIcon name={child.icon} className="w-3.5 h-3.5 shrink-0" />
              <span>{child.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
