'use client'

import { useState } from 'react'

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
      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-magenta-600 text-white hover:bg-magenta-700"
    >
      {copied ? 'Copiado!' : 'Copiar link'}
    </button>
  )
}
