'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

const ZOOM_LEVELS = [100, 150, 200, 300, 400]

export default function FlujogramaPage() {
  const [zoomIdx, setZoomIdx] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIdx]
  const canZoomIn = zoomIdx < ZOOM_LEVELS.length - 1
  const canZoomOut = zoomIdx > 0

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/documentacion" className="text-gray-400 hover:text-gray-600 text-sm">&larr; Documentación</Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Flujograma GOcelular</h1>
      <p className="text-sm text-gray-500 mb-6">Mapa de cron jobs: qué corre, cuándo y contra qué</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">Zoom: {zoom}%</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => canZoomOut && setZoomIdx(zoomIdx - 1)}
              disabled={!canZoomOut}
              className="w-8 h-8 flex items-center justify-center text-lg font-bold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              &minus;
            </button>
            <button
              onClick={() => setZoomIdx(0)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Ajustar
            </button>
            <button
              onClick={() => canZoomIn && setZoomIdx(zoomIdx + 1)}
              disabled={!canZoomIn}
              className="w-8 h-8 flex items-center justify-center text-lg font-bold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
        </div>
        <div className="overflow-auto max-h-[85vh]">
          <Image
            src="/flujograma-gocelular.jpeg"
            alt="Flujograma GOcelular — Mapa de cron jobs"
            width={2560}
            height={1440}
            className="h-auto"
            style={{ width: `${zoom}%`, maxWidth: 'none' }}
            priority
          />
        </div>
      </div>
    </div>
  )
}
