'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sincronizarSegurosAhora } from '@/lib/actions/seguros'

// Chip de última sincronización + botón de sync manual. La página ya no
// sincroniza al cargar (venía dando timeout): el cron corre cada hora y este
// botón fuerza una corrida completa cuando hace falta frescura inmediata.

function hace(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} días`
}

export default function BotonSincronizarSeguros({ ultimaSync }: { ultimaSync: string | null }) {
  const router = useRouter()
  const [corriendo, setCorriendo] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sincronizar = async () => {
    setCorriendo(true)
    setResultado(null)
    setError(null)
    try {
      const r = await sincronizarSegurosAhora()
      if (!r.ok) {
        setError(r.error ?? 'Error al sincronizar')
      } else {
        setResultado(`✓ ${r.emitidos ?? 0} emitidos · ${r.novedades ?? 0} novedades · ${r.mails ?? 0} mails`)
        router.refresh()
      }
    } catch {
      setError('Error al sincronizar — reintentá')
    } finally {
      setCorriendo(false)
    }
  }

  const desactualizada = ultimaSync !== null && Date.now() - new Date(ultimaSync).getTime() > 2 * 3600 * 1000

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`text-xs ${desactualizada ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
        {ultimaSync ? `Sincronizado ${hace(ultimaSync)}` : 'Sin sincronizar todavía'}
        {desactualizada && ' ⚠'}
      </span>
      <button
        onClick={sincronizar}
        disabled={corriendo}
        className="text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-full px-3 py-1 hover:border-gray-400 disabled:opacity-60"
        title="Corre la sincronización completa ahora (emisión de certificados, novedades, mora, mails). El cron la corre solo cada hora."
      >
        {corriendo ? 'Sincronizando… (puede tardar ~1 min)' : '↻ Sincronizar ahora'}
      </button>
      {resultado && <span className="text-xs text-green-700">{resultado}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
