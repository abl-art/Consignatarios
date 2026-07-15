'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { marcarPagadaAfiliado } from '@/lib/actions/liquidaciones-afiliados'

export function RowActions({ id, estado, tieneFactura }: { id: string; estado: string; tieneFactura: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handlePagada() {
    setLoading(true)
    const res = await marcarPagadaAfiliado(id)
    if (res && 'error' in res && res.error) {
      alert(res.error)
    }
    setLoading(false)
    router.refresh()
  }

  if (estado !== 'pendiente') return null

  return (
    <button
      onClick={handlePagada}
      disabled={loading || !tieneFactura}
      title={!tieneFactura ? 'Requiere factura adjunta' : ''}
      className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
    >
      {loading ? '...' : 'Marcar pagada'}
    </button>
  )
}

export function CopiarLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const url = `${window.location.origin}/afiliados/${slug}/liquidaciones`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
    >
      {copied ? 'Copiado!' : 'Link'}
    </button>
  )
}
