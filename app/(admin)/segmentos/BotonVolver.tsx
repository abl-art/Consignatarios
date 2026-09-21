'use client'

import { useRouter } from 'next/navigation'

export default function BotonVolver() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700"
    >
      ← Volver
    </button>
  )
}
