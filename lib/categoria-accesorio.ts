// Categorización de accesorios por SKU/nombre — mismas reglas que las cards
// del dashboard: kits por prefijo de SKU KS-, el resto por keywords del nombre
// (JBL cuenta como parlante aunque el nombre no lo diga).

export type CategoriaAccesorio = 'kit' | 'smartwatch' | 'auricular' | 'parlante' | 'otro'

const SMARTWATCHES_KW = ['pulsera', 'band', 'watch', 'smartwatch', 'reloj']
const AURICULARES_KW = ['buds', 'auricular', 'earphone', 'headphone', 'earbuds']
const PARLANTES_KW = ['speaker', 'parlante', 'bocina', 'altavoz', 'jbl']

export function categoriaAccesorio(sku: string, nombre: string): CategoriaAccesorio {
  if (sku.toUpperCase().startsWith('KS-')) return 'kit'
  const lower = nombre.toLowerCase()
  if (SMARTWATCHES_KW.some(k => lower.includes(k))) return 'smartwatch'
  if (AURICULARES_KW.some(k => lower.includes(k))) return 'auricular'
  if (PARLANTES_KW.some(k => lower.includes(k))) return 'parlante'
  return 'otro'
}
