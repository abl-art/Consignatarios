'use client'

/**
 * Botón genérico para descargar un template CSV.
 *
 * Regla del proyecto: TODA carga por CSV debe tener un botón "Descargar template"
 * al lado del input de archivo. El template incluye el header exacto + una fila de ejemplo.
 */

interface DescargarTemplateProps {
  filename: string
  headers: string[]
  ejemplos: string[][]
}

export default function DescargarTemplate({ filename, headers, ejemplos }: DescargarTemplateProps) {
  function handleDownload() {
    const escapar = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lineas = [
      headers.map(escapar).join(','),
      ...ejemplos.map((fila) => fila.map(escapar).join(',')),
    ]
    const csv = lineas.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-magenta-700 bg-magenta-50 border border-magenta-200 rounded-lg hover:bg-magenta-100 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Descargar template
    </button>
  )
}
