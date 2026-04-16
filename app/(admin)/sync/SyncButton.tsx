'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sincronizarVentas } from '@/lib/actions/sync'

export default function SyncButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setResult(null)
    const r = await sincronizarVentas()
    setRunning(false)
    if ('error' in r && r.error) setResult(`Error: ${r.error}`)
    else if ('ok' in r) setResult(`${r.nuevas} ventas nuevas · ${r.yaExistentes} ya existentes · ${r.noEncontrados} sin match · ${r.storeMismatches} alertas de sucursal`)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={run} disabled={running}
        className="px-5 py-2.5 bg-magenta-600 text-white text-sm font-semibold rounded-lg hover:bg-magenta-700 disabled:opacity-50">
        {running ? 'Sincronizando...' : 'Sincronizar ahora'}
      </button>
      {result && <span className="text-sm text-gray-700">{result}</span>}
    </div>
  )
}
