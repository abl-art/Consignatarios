// Logica pura del control de ingreso de ASN por link (provisorio): comparar
// los identificadores que DEBERIAN entrar (IMEIs/seriales de la ASN segun
// inventory_intake_items) contra lo que el operario de Andreani escaneo.

export interface ResultadoControl {
  /** esperados y escaneados */
  ok: string[]
  /** esperados que nadie escaneo */
  faltantes: string[]
  /** escaneados que no pertenecen a esta ASN */
  sobrantes: string[]
}

/** Normaliza un escaneo: dígitos y letras, sin espacios ni guiones. */
export function normalizarScan(s: string): string {
  return s.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function compararLectura(esperados: string[], leidos: string[], sobrantesLeidos: string[] = []): ResultadoControl {
  const setEsperados = new Set(esperados.map(normalizarScan))
  const setLeidos = new Set(leidos.map(normalizarScan))
  const ok: string[] = []
  const faltantes: string[] = []
  for (const e of setEsperados) (setLeidos.has(e) ? ok : faltantes).push(e)
  const sobrantes = [...new Set(sobrantesLeidos.map(normalizarScan))].filter(s => !setEsperados.has(s))
  return { ok, faltantes, sobrantes }
}

/** Texto de la novedad para GOcelular cuando el control cerro con diferencias. */
export function textoNovedadDiferencias(asnTransaccion: string, r: ResultadoControl, nota?: string | null): { titulo: string; detalle: string } {
  const titulo = `Control de ingreso ASN ${asnTransaccion}: ${r.faltantes.length} faltante(s), ${r.sobrantes.length} sobrante(s)`
  const partes = [
    `Control de recepcion fisica contra la ASN ${asnTransaccion} (escaneo en deposito Andreani).`,
    `Esperados: ${r.ok.length + r.faltantes.length} · Escaneados OK: ${r.ok.length}.`,
  ]
  if (r.faltantes.length > 0) partes.push(`FALTANTES (no escaneados): ${r.faltantes.join(', ')}`)
  if (r.sobrantes.length > 0) partes.push(`SOBRANTES (no pertenecen a la ASN): ${r.sobrantes.join(', ')}`)
  if (nota) partes.push(`Nota del operario: ${nota}`)
  return { titulo, detalle: partes.join('\n') }
}
