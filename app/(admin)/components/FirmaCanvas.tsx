'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

interface FirmaCanvasProps {
  onSave: (base64: string) => void
  width?: number
  height?: number
}

export default function FirmaCanvas({ onSave, width = 500, height = 200 }: FirmaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [hasStrokes, setHasStrokes] = useState(false)

  // Initialize canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  const getPos = useCallback((canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }, [])

  const startDrawing = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    isDrawing.current = true
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const draw = useCallback((x: number, y: number) => {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    setHasStrokes(true)
  }, [])

  const stopDrawing = useCallback(() => {
    isDrawing.current = false
  }, [])

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { x, y } = getPos(canvas, e.clientX, e.clientY)
    startDrawing(x, y)
  }, [getPos, startDrawing])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { x, y } = getPos(canvas, e.clientX, e.clientY)
    draw(x, y)
  }, [getPos, draw])

  const handleMouseUp = useCallback(() => stopDrawing(), [stopDrawing])
  const handleMouseLeave = useCallback(() => stopDrawing(), [stopDrawing])

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const touch = e.touches[0]
    const { x, y } = getPos(canvas, touch.clientX, touch.clientY)
    startDrawing(x, y)
  }, [getPos, startDrawing])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const touch = e.touches[0]
    const { x, y } = getPos(canvas, touch.clientX, touch.clientY)
    draw(x, y)
  }, [getPos, draw])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    stopDrawing()
  }, [stopDrawing])

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }, [])

  const handleConfirm = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasStrokes) return
    onSave(canvas.toDataURL('image/png'))
  }, [hasStrokes, onSave])

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Firma del consignatario
      </label>

      <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ maxWidth: width }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none cursor-crosshair block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      <div className="flex gap-3" style={{ maxWidth: width }}>
        <button
          type="button"
          onClick={handleClear}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!hasStrokes}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Confirmar firma
        </button>
      </div>
    </div>
  )
}
