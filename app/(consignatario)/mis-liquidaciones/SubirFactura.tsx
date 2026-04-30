'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { subirFactura } from '@/lib/actions/liquidaciones'

export default function SubirFactura({ liquidacionId, tieneFactura }: { liquidacionId: string; tieneFactura: boolean }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Solo se aceptan archivos PDF')
      return
    }
    setUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    const res = await subirFactura(liquidacionId, formData)
    if (res && 'error' in res && res.error) setError(res.error)
    setUploading(false)
    router.refresh()
    e.target.value = ''
  }

  return (
    <div className="flex items-center gap-2">
      {tieneFactura ? (
        <span className="text-xs text-green-600 font-medium">Factura ✓</span>
      ) : null}
      <label className={`px-3 py-1 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
        tieneFactura ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-magenta-600 text-white hover:bg-magenta-700'
      } ${uploading ? 'opacity-50' : ''}`}>
        {uploading ? 'Subiendo...' : tieneFactura ? 'Reemplazar' : 'Subir factura'}
        <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
