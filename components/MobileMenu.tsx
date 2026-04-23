'use client'

import { useState } from 'react'
import Link from 'next/link'

interface NavItem {
  href: string
  label: string
  external?: boolean
  children?: { href: string; label: string }[]
}

export default function MobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Header mobile */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-40">
        <img src="/logo.png" alt="GOcelular" className="h-7" />
        <button onClick={() => setOpen(!open)} className="p-2 text-gray-600">
          {open ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Overlay menu */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-72 h-full bg-white overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <img src="/logo.png" alt="GOcelular" className="h-7" />
              <button onClick={() => setOpen(false)} className="p-1 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {items.map(item => (
                <div key={item.href}>
                  {item.external ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
                      {item.label} ↗
                    </a>
                  ) : (
                    <Link href={item.href} onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm text-gray-700 font-medium rounded-lg hover:bg-gray-100">
                      {item.label}
                    </Link>
                  )}
                  {item.children?.map(child => (
                    <Link key={child.href} href={child.href} onClick={() => setOpen(false)}
                      className="block pl-8 pr-3 py-1.5 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
                      {child.label}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-gray-200">
              <form action="/api/auth/signout" method="post">
                <button type="submit" className="w-full text-left px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
