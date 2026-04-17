'use client'

import { useState, type ReactNode } from 'react'

interface Tab {
  id: string
  label: string
  content: ReactNode
}

export default function FinanzasTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
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
