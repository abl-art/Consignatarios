import * as XLSX from 'xlsx'

export interface ImeiParseResult {
  lines: { sku: string; ean: string | null; imeis: string[] }[]
  errores: string[]
}

export function luhnValido(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

function esBase64Xlsx(data: string): boolean {
  if (data.length < 50) return false
  return /^[A-Za-z0-9+/\n]+=*$/.test(data.slice(0, 200))
}

// Convierte el archivo (xlsx base64 o CSV plano legacy) en una matriz de celdas string
function aMatriz(data: string): string[][] {
  if (esBase64Xlsx(data)) {
    const wb = XLSX.read(data, { type: 'base64' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' })
    return rows.map(r => r.map(c => String(c ?? '').trim()))
  }
  // Legacy: texto plano, separador ; o , o tab
  const sep = data.includes(';') ? ';' : data.includes('\t') ? '\t' : ','
  return data
    .split(/\r?\n/)
    .filter(l => l.trim())
    .map(l => l.split(sep).map(c => c.trim()))
}

export function parseImeiExcel(imeiFileB64OrText: string, skusConocidos: Set<string>): ImeiParseResult {
  let matriz: string[][]
  try {
    matriz = aMatriz(imeiFileB64OrText)
  } catch {
    return { lines: [], errores: ['No pude leer el archivo de IMEIs (formato no reconocido)'] }
  }
  if (matriz.length === 0) return { lines: [], errores: ['El archivo de IMEIs está vacío'] }

  const nCols = Math.max(...matriz.map(r => r.length))

  // Clasificar cada columna por contenido de sus celdas no vacias
  const stats = Array.from({ length: nCols }, (_, col) => {
    let imeis = 0, eans = 0, skuMatch = 0, textos = 0, noVacias = 0
    for (const row of matriz) {
      const v = (row[col] ?? '').replace(/\s/g, '')
      if (!v) continue
      noVacias++
      if (/^\d{15}$/.test(v)) imeis++
      else if (/^\d{8,14}$/.test(v)) eans++
      else textos++
      if (skusConocidos.has(v)) skuMatch++
    }
    return { col, imeis, eans, skuMatch, textos, noVacias }
  })

  const colImei = stats.filter(s => s.imeis > 0).sort((a, b) => b.imeis - a.imeis)[0]
  if (!colImei) {
    return { lines: [], errores: ['No encontré una columna de IMEIs (15 dígitos) en el archivo'] }
  }

  // SKU: primero la columna con mas matches contra el catalogo; si no hay, la de texto con mas valores
  let colSku = stats.filter(s => s.col !== colImei.col && s.skuMatch > 0).sort((a, b) => b.skuMatch - a.skuMatch)[0]
  if (!colSku) colSku = stats.filter(s => s.col !== colImei.col && s.textos > 0).sort((a, b) => b.textos - a.textos)[0]
  if (!colSku) {
    return { lines: [], errores: ['No encontré una columna de SKU en el archivo'] }
  }

  const colEan = stats
    .filter(s => s.col !== colImei.col && s.col !== colSku.col && s.eans > 0)
    .sort((a, b) => b.eans - a.eans)[0]

  const errores: string[] = []
  const porSku = new Map<string, { ean: string | null; imeis: string[] }>()
  const vistos = new Set<string>()

  for (const row of matriz) {
    const rawImei = (row[colImei.col] ?? '').replace(/\s/g, '')
    if (!/^\d{15}$/.test(rawImei)) continue // fila de encabezado o vacia
    const sku = (row[colSku.col] ?? '').trim()
    const ean = colEan ? (row[colEan.col] ?? '').replace(/\s/g, '') || null : null

    if (!luhnValido(rawImei)) {
      errores.push(`IMEI con dígito verificador inválido: ${rawImei}`)
      continue
    }
    if (vistos.has(rawImei)) {
      errores.push(`IMEI duplicado en el archivo: ${rawImei}`)
      continue
    }
    vistos.add(rawImei)
    if (!sku) {
      errores.push(`IMEI ${rawImei} sin SKU en su fila`)
      continue
    }
    if (!porSku.has(sku)) porSku.set(sku, { ean, imeis: [] })
    porSku.get(sku)!.imeis.push(rawImei)
  }

  if (porSku.size === 0 && errores.length === 0) {
    errores.push('No encontré filas válidas con IMEI y SKU en el archivo')
  }

  return {
    lines: [...porSku.entries()].map(([sku, d]) => ({ sku, ean: d.ean, imeis: d.imeis })),
    errores,
  }
}
