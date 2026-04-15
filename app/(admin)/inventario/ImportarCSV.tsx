'use client'

import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { validarIMEI } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

export interface FilaCSV {
  imei: string
  marca: string
  modelo: string
}

export interface ErrorCSV {
  linea: number
  error: string
}

export interface ResultadoCSV {
  validas: FilaCSV[]
  errores: ErrorCSV[]
}

export function parsearCSVDispositivos(csv: string): ResultadoCSV {
  const resultado = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: true })
  const filas = resultado.data

  if (filas.length <= 1) return { validas: [], errores: [] }

  // Saltar header
  const validas: FilaCSV[] = []
  const errores: ErrorCSV[] = []

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i]
    const linea = i + 1

    if (!fila || fila.every(c => !c.trim())) continue

    if (fila.length < 3 || !fila[0] || !fila[1] || !fila[2]) {
      errores.push({ linea, error: 'Faltan columnas (se esperan: imei, marca, modelo)' })
      continue
    }

    const imei = fila[0].trim()
    const marca = fila[1].trim()
    const modelo = fila[2].trim()

    if (!validarIMEI(imei)) {
      errores.push({ linea, error: `IMEI inválido: "${imei}" (debe tener 15 dígitos numéricos)` })
      continue
    }

    validas.push({ imei, marca, modelo })
  }

  return { validas, errores }
}

export default function ImportarCSV({ onImportado }: { onImportado: () => void }) {
  const [resultado, setResultado] = useState<ResultadoCSV | null>(null)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; duplicados: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const csv = ev.target?.result as string
      setResultado(parsearCSVDispositivos(csv))
      setImportResult(null)
    }
    reader.readAsText(file)
  }

  async function handleImportar() {
    if (!resultado || resultado.validas.length === 0) return
    setImportando(true)

    const supabase = createClient()
    let ok = 0
    let duplicados = 0

    for (const fila of resultado.validas) {
      // Buscar o crear modelo
      let { data: modelo } = await supabase
        .from('modelos')
        .select('id')
        .eq('marca', fila.marca)
        .eq('modelo', fila.modelo)
        .single()

      if (!modelo) {
        const { data: nuevoModelo } = await supabase
          .from('modelos')
          .insert({ marca: fila.marca, modelo: fila.modelo, precio_costo: 0 })
          .select('id')
          .single()
        modelo = nuevoModelo
      }

      if (!modelo) continue

      const { error } = await supabase
        .from('dispositivos')
        .insert({ imei: fila.imei, modelo_id: modelo.id, estado: 'disponible' })

      if (error && error.code === '23505') duplicados++
      else if (!error) ok++
    }

    setImportResult({ ok, duplicados })
    setImportando(false)
    if (ok > 0) onImportado()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Carga masiva por CSV
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Formato: <code className="bg-gray-100 px-1 rounded">imei,marca,modelo</code> — una línea por equipo.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200"
      />

      {resultado && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-green-700">✓ {resultado.validas.length} filas válidas</span>
            {resultado.errores.length > 0 && (
              <span className="text-red-600">✗ {resultado.errores.length} errores</span>
            )}
          </div>

          {resultado.errores.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs space-y-1">
              {resultado.errores.map((e, i) => (
                <p key={i} className="text-red-700">Línea {e.linea}: {e.error}</p>
              ))}
            </div>
          )}

          {resultado.validas.length > 0 && (
            <button
              onClick={handleImportar}
              disabled={importando}
              className="px-4 py-2 bg-magenta-600 text-white text-sm font-medium rounded-lg hover:bg-magenta-700 disabled:opacity-50"
            >
              {importando ? 'Importando...' : `Importar ${resultado.validas.length} equipos`}
            </button>
          )}

          {importResult && (
            <p className="text-sm text-green-700">
              ✓ {importResult.ok} equipos importados
              {importResult.duplicados > 0 && ` · ${importResult.duplicados} duplicados ignorados`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
