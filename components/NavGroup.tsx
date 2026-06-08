'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import NavIcon, { type IconName } from '@/components/NavIcon'

interface NavChild {
  href: string
  label: string
  icon: IconName
  badge?: number
  header?: boolean
}

// Groups children into sections: items before first header are standalone,
// then each header starts a new collapsible section with its following items
function groupChildren(children: NavChild[]) {
  const sections: { header?: NavChild; items: NavChild[] }[] = []
  let current: { header?: NavChild; items: NavChild[] } = { items: [] }

  for (const child of children) {
    if (child.header) {
      if (current.header || current.items.length > 0) sections.push(current)
      current = { header: child, items: [] }
    } else {
      current.items.push(child)
    }
  }
  if (current.header || current.items.length > 0) sections.push(current)
  return sections
}

function SubGroup({ header, items, pathname }: { header: NavChild; items: NavChild[]; pathname: string }) {
  const isActive = pathname.startsWith(header.href) || items.some(c => pathname.startsWith(c.href))
  const [open, setOpen] = useState(isActive)

  return (
    <div>
      <div className="flex items-center">
        <Link
          href={header.href}
          className={`flex-1 flex items-center gap-2 px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
            isActive ? 'text-magenta-700' : 'text-gray-400 hover:text-magenta-700'
          }`}
        >
          <span>{header.label}</span>
        </Link>
        {items.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            className="px-2 py-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${open ? 'rotate-45' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>
      {open && items.length > 0 && (
        <div className="ml-2 space-y-0.5">
          {items.map(child => (
            <ChildLink key={child.href} child={child} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChildLink({ child, pathname }: { child: NavChild; pathname: string }) {
  const isExternal = child.href.startsWith('http')
  if (isExternal) {
    return (
      <a
        href={child.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg text-gray-500 hover:bg-magenta-50 hover:text-magenta-700 transition-colors"
      >
        <NavIcon name={child.icon} className="w-3.5 h-3.5 shrink-0" />
        <span>{child.label}</span>
        <svg className="w-2.5 h-2.5 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
      </a>
    )
  }
  return (
    <Link
      href={child.href}
      className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-colors ${
        pathname.startsWith(child.href)
          ? 'bg-magenta-50 text-magenta-700'
          : 'text-gray-500 hover:bg-magenta-50 hover:text-magenta-700'
      }`}
    >
      <NavIcon name={child.icon} className="w-3.5 h-3.5 shrink-0" />
      <span>{child.label}</span>
      {child.badge && child.badge > 0 && (
        <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold bg-red-600 text-white rounded-full">{child.badge}</span>
      )}
    </Link>
  )
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
  const isChildActive = children.some((c) => !c.href.startsWith('http') && pathname.startsWith(c.href))
  const [open, setOpen] = useState(pathname.startsWith(href) || isChildActive)
  const sections = groupChildren(children)

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
          {sections.map((section, i) =>
            section.header ? (
              <SubGroup key={section.header.href} header={section.header} items={section.items} pathname={pathname} />
            ) : (
              section.items.map(child => (
                <ChildLink key={child.href} child={child} pathname={pathname} />
              ))
            )
          )}
        </div>
      )}
    </div>
  )
}
