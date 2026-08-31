'use client'

import { useState, type ReactNode } from 'react'

export default function TabsListaBonos({ lista, bonos, cantidadBonos }: { lista: ReactNode; bonos: ReactNode; cantidadBonos: number }) {
  const [tab, setTab] = useState<'lista' | 'bonos'>('lista')

  const btn = (activo: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
      activo ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
    }`

  return (
    <div>
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button className={btn(tab === 'lista')} onClick={() => setTab('lista')}>Lista</button>
        <button className={btn(tab === 'bonos')} onClick={() => setTab('bonos')}>
          Bonos{cantidadBonos > 0 && ` (${cantidadBonos})`}
        </button>
      </div>
      <div className={tab === 'lista' ? '' : 'hidden'}>{lista}</div>
      <div className={tab === 'bonos' ? '' : 'hidden'}>{bonos}</div>
    </div>
  )
}
