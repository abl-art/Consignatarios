// Parser del texto de echeqs que llega por mensaje (7 líneas por cheque):
// nro cheque / código echeq / emisor / CUIT / fecha emisión / fecha cobro / monto

export interface EcheqParseado {
  nro_cheque: string
  codigo: string
  emisor: string
  cuit_emisor: string
  fecha_emision: string // yyyy-mm-dd
  fecha_cobro: string // yyyy-mm-dd
  monto: number
}

export interface ResultadoParseo {
  cheques: EcheqParseado[]
  errores: string[]
}

const RE_NRO = /^\d{5,10}$/
const RE_CODIGO = /^(?=.*[A-Z])[A-Z0-9]{8,24}$/i
const RE_FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/
const RE_MONTO = /\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/

function parseFecha(linea: string): string | null {
  const m = linea.match(RE_FECHA)
  if (!m) return null
  const [, d, mes, a] = m
  const anio = a.length === 2 ? `20${a}` : a
  const dia = Number(d)
  const mesN = Number(mes)
  if (dia < 1 || dia > 31 || mesN < 1 || mesN > 12) return null
  return `${anio}-${String(mesN).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function parseMonto(linea: string): number | null {
  const m = linea.match(RE_MONTO)
  if (!m) return null
  const num = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return isNaN(num) || num <= 0 ? null : num
}

function parseCuit(linea: string): string | null {
  const digitos = linea.replace(/\D/g, '')
  if (digitos.length !== 11) return null
  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`
}

export function parseEcheqs(texto: string): ResultadoParseo {
  const lineas = texto
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  const cheques: EcheqParseado[] = []
  const errores: string[] = []
  let i = 0

  while (i < lineas.length) {
    // Buscar el inicio del próximo cheque (línea de número)
    if (!RE_NRO.test(lineas[i])) {
      // Texto suelto entre cheques (comentarios del mensaje) — se ignora
      i++
      continue
    }

    const bloque = lineas.slice(i, i + 7)
    const n = cheques.length + 1

    if (bloque.length < 7) {
      errores.push(`Cheque ${n} (nro ${bloque[0]}): faltan datos, se esperaban 7 líneas`)
      break
    }

    const [lNro, lCodigo, lEmisor, lCuit, lEmision, lCobro, lMonto] = bloque
    const codigo = RE_CODIGO.test(lCodigo) ? lCodigo.toUpperCase() : null
    const cuit = parseCuit(lCuit)
    const emision = parseFecha(lEmision)
    const cobro = parseFecha(lCobro)
    const monto = parseMonto(lMonto)

    const faltantes: string[] = []
    if (!codigo) faltantes.push(`código ("${lCodigo}")`)
    if (!cuit) faltantes.push(`CUIT ("${lCuit}")`)
    if (!emision) faltantes.push(`fecha de emisión ("${lEmision}")`)
    if (!cobro) faltantes.push(`fecha de cobro ("${lCobro}")`)
    if (!monto) faltantes.push(`monto ("${lMonto}")`)

    if (faltantes.length > 0) {
      errores.push(`Cheque ${n} (nro ${lNro}): no se pudo leer ${faltantes.join(', ')}`)
      i++ // avanzar de a una línea para reintentar sincronizar
      continue
    }

    cheques.push({
      nro_cheque: lNro,
      codigo: codigo!,
      emisor: lEmisor,
      cuit_emisor: cuit!,
      fecha_emision: emision!,
      fecha_cobro: cobro!,
      monto: monto!,
    })
    i += 7
  }

  return { cheques, errores }
}
