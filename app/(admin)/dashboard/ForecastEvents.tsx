'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setForecastEvents } from '@/lib/actions/finanzas'

interface Props {
  events: Record<string, number> // e.g. {"2026-05": 1.4}
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatMultiplier(v: number | undefined): string {
  if (v === undefined) return '-'
  if (v === 1) return 'base'
  const pct = Math.round((v - 1) * 100)
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

function getNext6Months(): string[] {
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${yyyy}-${mm}`)
  }
  return months
}

export default function ForecastEvents({ events }: Props) {
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const [k, v] of Object.entries(events)) {
      init[k] = String(v)
    }
    return init
  })
  const [saving, setSaving] = useState(false)

  const months = getNext6Months()

  async function handleSave() {
    setSaving(true)
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(local)) {
      const n = parseFloat(v)
      if (!isNaN(n) && n > 0) {
        parsed[k] = n
      }
    }
    await setForecastEvents(parsed)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Eventos de estacionalidad</h3>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {months.map((key) => {
          const monthIdx = parseInt(key.split('-')[1], 10) - 1
          const label = MONTH_NAMES[monthIdx]
          const val = local[key]
          const numVal = val ? parseFloat(val) : undefined

          return (
            <div key={key} className="text-center">
              <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
              <p className="text-xs text-gray-400 mb-1">{formatMultiplier(numVal)}</p>
              <input
                type="number"
                step="0.1"
                min="0"
                className="w-full text-center text-sm border border-gray-200 rounded px-1 py-1"
                placeholder="-"
                value={local[key] ?? ''}
                onChange={(e) => {
                  setLocal((prev) => {
                    const next = { ...prev }
                    if (e.target.value === '') {
                      delete next[key]
                    } else {
                      next[key] = e.target.value
                    }
                    return next
                  })
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm font-medium text-white bg-magenta-600 hover:bg-magenta-700 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
