// Lógica pura (sin I/O) del formulario público de denuncias (/denuncia-robo,
// Task 8): validación de archivo adjunto, sanitización de nombre para la
// storage key y el predicado de vigencia de un certificado. Extraída de
// app/api/denuncia-robo/*.ts para poder testearla sin mockear Supabase/fetch
// — ambos route handlers importan y usan estas mismas funciones, así que no
// hay drift posible entre /validar y el POST de creación.

/** Tamaño máximo del archivo adjunto a la denuncia. */
export const MAX_BYTES_DENUNCIA = 10 * 1024 * 1024

/** Extensión aceptada -> content-type esperado. Único punto de verdad para qué se acepta. */
const MIME_POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
}

export type FirmaArchivo = 'jpeg' | 'png' | 'pdf'

function firmaEsperadaDeExtension(extension: string): FirmaArchivo | null {
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (extension === 'png') return 'png'
  if (extension === 'pdf') return 'pdf'
  return null
}

/**
 * Sniff barato por magic bytes — no confía en el Content-Type declarado por
 * el navegador ni en la extensión del nombre de archivo, que un cliente
 * hostil puede mentir libremente. JPEG: FF D8 FF. PNG: 89 50 4E 47. PDF:
 * "%PDF" (25 50 44 46).
 */
export function firmaDeArchivo(bytes: Uint8Array): FirmaArchivo | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf'
  return null
}

export type ResultadoValidarArchivo =
  | { ok: true; extension: string; mime: string }
  | { ok: false; motivo: string }

/**
 * Valida el archivo adjunto a una denuncia en 4 capas: tamaño (0 < size ≤
 * 10MB), extensión (allowlist .jpg/.jpeg/.png/.pdf), Content-Type declarado
 * (debe matchear el mime esperado por extensión, o venir genérico
 * `application/octet-stream`), y la firma real de los primeros bytes del
 * archivo (debe coincidir con la firma esperada para esa extensión — esto es
 * lo que de verdad impide subir un `.txt` renombrado a `.png`).
 */
export function validarArchivoDenuncia(
  nombre: string,
  size: number,
  contentType: string,
  primerosBytes: Uint8Array
): ResultadoValidarArchivo {
  if (size === 0) return { ok: false, motivo: 'El archivo está vacío' }
  if (size > MAX_BYTES_DENUNCIA) return { ok: false, motivo: 'El archivo supera los 10MB' }

  const extension = (nombre.split('.').pop() || '').toLowerCase()
  const mimeEsperado = MIME_POR_EXTENSION[extension]
  const firmaEsperada = firmaEsperadaDeExtension(extension)
  if (!mimeEsperado || !firmaEsperada) {
    return { ok: false, motivo: 'Formato no permitido (.jpg, .jpeg, .png, .pdf)' }
  }

  // Content-Type declarado: si el navegador mandó uno explícito que no es ni
  // el esperado ni el genérico de fallback, se rechaza antes de mirar el
  // contenido. Algunos navegadores mandan application/octet-stream para
  // ciertos tipos de archivo — eso se tolera y se resuelve con el sniff.
  if (contentType && contentType !== mimeEsperado && contentType !== 'application/octet-stream') {
    return { ok: false, motivo: 'El tipo de archivo no coincide con la extensión' }
  }

  if (firmaDeArchivo(primerosBytes) !== firmaEsperada) {
    return { ok: false, motivo: 'El contenido del archivo no coincide con su extensión' }
  }

  return { ok: true, extension, mime: mimeEsperado }
}

/**
 * Solo el nombre de archivo (sin ruta) y solo caracteres seguros para una
 * storage key. Split por `/` y `\` antes de sanitizar se queda SOLO con el
 * último segmento — eso es lo que neutraliza un intento de path traversal
 * (`../../x.png` → `x.png`, `a/b\c.pdf` → `c.pdf`): nunca llega a armar una
 * key con `..` ni con separadores de directorio.
 */
export function sanitizarNombreArchivo(nombre: string): string {
  const base = nombre.split(/[/\\]/).pop() || 'archivo'
  const limpio = base.replace(/[^a-zA-Z0-9._-]/g, '_')
  return limpio.slice(-120) || 'archivo'
}

/**
 * N° de certificado tipeado por el cliente → entero positivo, o null si no
 * tiene forma de número (tolera espacios, puntos de miles y un "N°"/"Nº"/"#"
 * pegado — la gente copia del mail tal cual lo ve).
 */
export function normalizarNumeroCertificado(input: string): number | null {
  const digitos = input.replace(/\D/g, '')
  if (!digitos) return null
  const numero = parseInt(digitos, 10)
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null
}

export type ResultadoBajaImei = { ok: true; valor: string } | { ok: false; motivo: string }

/**
 * Número de gestión/constancia de la baja del IMEI (lo da la operadora al
 * llamar al *910). Cada operadora usa su formato (numérico, alfanumérico,
 * con guiones), así que la validación es laxa a propósito: 4 a 60 caracteres
 * de letras/números/espacios y separadores comunes. El objetivo es rechazar
 * basura obvia ("-", "no tengo"→ pasa pero eso lo filtra Yami) sin rebotar
 * constancias reales.
 */
export function validarBajaImei(input: string): ResultadoBajaImei {
  const valor = input.trim().replace(/\s+/g, ' ')
  if (valor.length < 4) return { ok: false, motivo: 'Ingresá el número de gestión que te dio la operadora al dar de baja el IMEI (mínimo 4 caracteres).' }
  if (valor.length > 60) return { ok: false, motivo: 'El número de gestión no puede superar los 60 caracteres.' }
  if (!/^[A-Za-z0-9 ._/#-]+$/.test(valor)) return { ok: false, motivo: 'El número de gestión solo puede tener letras, números y guiones.' }
  if (!/[0-9]/.test(valor)) return { ok: false, motivo: 'El número de gestión debe incluir al menos un número.' }
  return { ok: true, valor }
}

export type CertParaVigencia = {
  estado: string
  fechaAnula: string | null
  fechaSiniestro: string | null
  finVig: string
}

/** Vigente = estado emitido, sin anulación, sin siniestro ya cargado, y fin_vig todavía no pasó (hoy inclusive). */
export function esCertificadoVigente(cert: CertParaVigencia, hoy: string): boolean {
  return (
    cert.estado === 'emitido' &&
    cert.fechaAnula === null &&
    cert.fechaSiniestro === null &&
    cert.finVig >= hoy
  )
}
