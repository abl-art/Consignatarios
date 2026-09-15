'use client'

import { useState, type ReactNode } from 'react'

export default function TabsListaBonos({
  lista,
  bonos,
  notasCredito,
  margenExtra,
  cantidadBonos,
  ncPendientes,
}: {
  lista: ReactNode
  bonos: ReactNode
  notasCredito: ReactNode
  margenExtra: ReactNode
  cantidadBonos: number
  ncPendientes: number
}) {
  const [tab, setTab] = useState<'lista' | 'bonos' | 'nc' | 'margen'>('lista')

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
        <button className={btn(tab === 'nc')} onClick={() => setTab('nc')}>
          Notas de crédito{ncPendientes > 0 && ` (${ncPendientes})`}
        </button>
        <button className={btn(tab === 'margen')} onClick={() => setTab('margen')}>Margen extra</button>
      </div>
      <div className={tab === 'lista' ? '' : 'hidden'}>{lista}</div>
      <div className={tab === 'bonos' ? '' : 'hidden'}>{bonos}</div>
      <div className={tab === 'nc' ? '' : 'hidden'}>{notasCredito}</div>
      <div className={tab === 'margen' ? '' : 'hidden'}>{margenExtra}</div>
    </div>
  )
}
