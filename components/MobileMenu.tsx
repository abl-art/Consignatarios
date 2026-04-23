'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  external?: boolean
  children?: { href: string; label: string }[]
}

const TABS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/inventario', label: 'Inventario', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/compras', label: 'Compras', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
  { href: '/asignar', label: 'Asignar', icon: 'M12 4v16m8-8H4' },
]

export default function MobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      {/* Bottom tab bar - mobile only */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-center justify-around px-1 py-1 safe-bottom">
        {TABS.map(tab => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link key={tab.href} href={tab.href} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-0 ${active ? 'text-magenta-700' : 'text-gray-400'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={active ? 2.5 : 1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              <span className="text-[9px] font-medium truncate">{tab.label}</span>
            </Link>
          )
        })}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 px-2 py-1.5 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="text-[9px] font-medium">Más</span>
        </button>
      </div>

      {/* Overlay menu (Más) */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto safe-bottom" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <nav className="p-4 space-y-1">
              {items.map(item => (
                <div key={item.href}>
                  {item.external ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}
                      className="flex items-center justify-between px-4 py-3 text-sm text-gray-600 rounded-xl hover:bg-gray-50">
                      {item.label}
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  ) : (
                    <Link href={item.href} onClick={() => setOpen(false)}
                      className="block px-4 py-3 text-sm text-gray-700 font-medium rounded-xl hover:bg-gray-50">
                      {item.label}
                    </Link>
                  )}
                  {item.children?.map(child => (
                    <Link key={child.href} href={child.href} onClick={() => setOpen(false)}
                      className="block pl-10 pr-4 py-2 text-sm text-gray-500 rounded-xl hover:bg-gray-50">
                      {child.label}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="pt-2 border-t border-gray-200 mt-2">
                <form action="/api/auth/signout" method="post">
                  <button type="submit" className="w-full text-left px-4 py-3 text-sm text-red-500 rounded-xl hover:bg-red-50">
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
