// Listado público de teléfonos vendibles con GOcelular (/catalogo).
// Fuente de verdad: device_models. Las variantes de memoria/RAM del mismo
// modelo ("Moto G06 64gb" y "Moto G06 4/128GB") se agrupan en UNA entrada
// comercial — la memoria no cambia si se puede vender o no. 4G vs 5G sí
// distinguen: son equipos distintos.

export interface ModeloCatalogo {
  modelCode: string
  nombre: string
  marca: string
  activo: boolean
  lockSolution: string | null
  dispositivos: number
  alias: string[]
}

export interface ModeloAgrupado {
  nombre: string
  marca: string
  modelCodes: string[]
}

export interface CatalogoAgrupado {
  marcas: string[]
  modelos: ModeloAgrupado[]
}

// "Celular Samsung Galaxy A07 4/64 GB" → "Samsung Galaxy A07"
function limpiarNombre(nombre: string): string {
  return nombre
    .replace(/^celular\s+/i, '')
    .replace(/-?\s*\d+\s*(gb)?\s*\/\s*\d+\s*(gb)?/gi, ' ') // pares "4/128GB", "256GB/8GB"
    .replace(/\b\d+\s*gb\b/gi, ' ') // sueltos "64gb", "512GB" (no toca "5G")
    .replace(/\s*-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function agruparCatalogo(modelos: ModeloCatalogo[]): CatalogoAgrupado {
  const grupos = new Map<string, ModeloAgrupado>()
  for (const m of modelos) {
    if (!m.activo) continue
    const limpio = limpiarNombre(m.nombre)
    // clave sin la marca adelante, así "Moto G15" y "Motorola Moto G15" se unen
    const sinMarca = limpio.toLowerCase().startsWith(m.marca.toLowerCase() + ' ')
      ? limpio.slice(m.marca.length + 1)
      : limpio
    const clave = `${m.marca.toLowerCase()}|${sinMarca.toLowerCase()}`
    const existente = grupos.get(clave)
    if (existente) {
      existente.modelCodes.push(m.modelCode)
      // preferir el nombre que ya incluye la marca
      if (limpio.toLowerCase().startsWith(m.marca.toLowerCase())) existente.nombre = limpio
    } else {
      const nombre = limpio.toLowerCase().startsWith(m.marca.toLowerCase()) ? limpio : `${m.marca} ${limpio}`
      grupos.set(clave, { nombre, marca: m.marca, modelCodes: [m.modelCode] })
    }
  }

  const lista = [...grupos.values()].sort(
    (a, b) => a.marca.localeCompare(b.marca) || a.nombre.localeCompare(b.nombre),
  )
  const marcas = [...new Set(lista.map(m => m.marca))].sort((a, b) => a.localeCompare(b))
  return { marcas, modelos: lista }
}
