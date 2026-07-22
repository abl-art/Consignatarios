'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

export default function FlujogramaPage() {
  const [zoomed, setZoomed] = useState(false)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/documentacion" className="text-gray-400 hover:text-gray-600 text-sm">← Documentación</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Flujograma GOcelular</h1>
      <p className="text-sm text-gray-500 mb-6">Mapa de cron jobs: qué corre, cuándo y contra qué</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">Hacé click en la imagen para {zoomed ? 'reducir' : 'ampliar'}</span>
          <button
            onClick={() => setZoomed(!zoomed)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            {zoomed ? 'Reducir' : 'Ampliar'}
          </button>
        </div>
        <div
          className={`${zoomed ? 'overflow-auto max-h-[85vh]' : ''} cursor-pointer`}
          onClick={() => setZoomed(!zoomed)}
        >
          <Image
            src="/flujograma-gocelular.jpeg"
            alt="Flujograma GOcelular — Mapa de cron jobs"
            width={2560}
            height={1440}
            className={`w-full h-auto ${zoomed ? 'max-w-none w-[2560px]' : ''}`}
            priority
          />
        </div>
      </div>
    </div>
  )
}
