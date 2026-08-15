'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavIcon, { type IconName } from '@/components/NavIcon'

export interface AdminNavItem {
  href: string
  label: string
  icon: IconName
  external?: boolean
  badge?: boolean
}

const STORAGE_KEY = 'admin-sidebar-collapsed'

export default function AdminSidebar({ items, tacsPendientes }: { items: AdminNavItem[]; tacsPendientes: number }) {
  const [collapsed, setCollapsed] = useState(false)
  // Sin transición hasta montar: evita que el sidebar se anime al hidratar con la preferencia guardada
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1')
    setMounted(true)
  }, [])

  const toggle = () => {
    setCollapsed(prev => {
      localStorage.setItem(STORAGE_KEY, prev ? '0' : '1')
      return !prev
    })
  }

  const itemClass = `flex items-center gap-2 py-2 text-sm text-gray-600 rounded-lg hover:bg-magenta-50 hover:text-magenta-700 transition-colors ${collapsed ? 'px-0 justify-center' : 'px-3'}`

  return (
    <aside className={`hidden md:flex bg-white border-r border-gray-200 flex-col shrink-0 ${collapsed ? 'w-14' : 'w-60'} ${mounted ? 'transition-[width] duration-200' : ''}`}>
      <div className={`border-b border-gray-200 ${collapsed ? 'p-3 flex justify-center' : 'p-5'}`}>
        {collapsed ? (
          <img src="/icon-192.png" alt="GOcelular" className="h-8 w-8 rounded" />
        ) : (
          <>
            <img src="/logo.png" alt="GOcelular" className="h-8" />
            <span className="text-xs text-gray-400 block">Panel Admin</span>
          </>
        )}
      </div>
      <nav className={`flex-1 space-y-0.5 overflow-y-auto ${collapsed ? 'p-2' : 'p-3'}`}>
        {items.map((item) =>
          item.external ? (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              title={collapsed ? item.label : undefined}
              className={itemClass}
            >
              <NavIcon name={item.icon} />
              {!collapsed && (
                <>
                  <span>{item.label}</span>
                  <svg className="w-3 h-3 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </>
              )}
            </a>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`${itemClass} ${collapsed ? 'relative' : ''}`}
            >
              <NavIcon name={item.icon} />
              {!collapsed && <span>{item.label}</span>}
              {item.badge && tacsPendientes > 0 && (
                collapsed ? (
                  <span className="absolute top-1 right-1.5 w-2 h-2 bg-red-600 rounded-full" />
                ) : (
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded-full">{tacsPendientes}</span>
                )
              )}
            </Link>
          )
        )}
      </nav>
      <div className={`border-t border-gray-200 ${collapsed ? 'p-2' : 'p-3'} space-y-0.5`}>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`w-full flex items-center gap-2 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors ${collapsed ? 'px-0 justify-center' : 'px-3'}`}
        >
          <svg className={`w-4 h-4 shrink-0 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
          {!collapsed && <span>Colapsar menú</span>}
        </button>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center gap-2 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors ${collapsed ? 'px-0 justify-center' : 'px-3 text-left'}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </form>
      </div>
    </aside>
  )
}
