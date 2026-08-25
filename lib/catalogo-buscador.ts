// Buscador público de teléfonos vendibles con GOcelular (/catalogo).
// Fuente de verdad: device_models — cada resultado es UN model_code, sin
// duplicados aunque el mismo equipo tenga distintos nombres según quién lo
// venda ("Celular Samsung Galaxy A17 4/128 GB" ≈ "Samsung Galaxy A17 128GB").
//
// Matching por tokens sobre nombre canónico + alias, normalizando igual que
// normalizarModelo: case/símbolos, y el par RAM/almacenamiento en cualquier
// orden ("4/256" ≈ "256/4", el gestor y Xiaomi los invierten).

export interface ModeloCatalogo {
  modelCode: string
  nombre: string
  marca: string
  activo: boolean
  lockSolution: string | null
  dispositivos: number
  alias: string[]
}

function normalizar(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Variantes de un texto para el índice: normalizado y con cada par A/B invertido
function variantes(s: string): string[] {
  const base = s.toLowerCase()
  const invertido = base.replace(/(\d+)\s*\/\s*(\d+)/g, '$2/$1')
  const todas = invertido === base ? [base] : [base, invertido]
  return todas.map(normalizar)
}

function indexar(m: ModeloCatalogo): string[] {
  // sin espacios: así "128gb" (token) matchea "128 gb" (haystack) y viceversa
  return [m.nombre, ...m.alias].flatMap(variantes).map(v => v.replace(/ /g, ''))
}

export function buscarModelos(consulta: string, modelos: ModeloCatalogo[]): ModeloCatalogo[] {
  const ordenados = [...modelos].sort(
    (a, b) => a.marca.localeCompare(b.marca) || a.nombre.localeCompare(b.nombre),
  )
  const tokens = normalizar(consulta).split(' ').filter(Boolean)
  if (tokens.length === 0) return ordenados

  // cada token de la consulta debe aparecer en alguna entrada del índice
  return ordenados.filter((m) => {
    const indice = indexar(m)
    return tokens.every(t => indice.some(h => h.includes(t)))
  })
}
