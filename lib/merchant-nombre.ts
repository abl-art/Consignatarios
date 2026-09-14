// Nombre comercial de un cliente tercero a partir de sus tiendas en gocuotas_stores.
// merchant_name suele venir NULL y el formato de store_name no es uniforme:
// la mayoría nombra "Merchant - GOcelular - Sucursal" pero hay merchants que ponen
// la dirección primero ("9 de Julio 5 - Geo Comunicaciones - GOcelular."), así que
// tomar el primer segmento muestra la dirección como nombre. Con varias tiendas,
// el segmento que se repite en todas es el merchant; direcciones y sucursales cambian.

export interface StoreNombreRow {
  merchantName: string | null
  storeName: string
  updatedAt: string
}

const esGocelular = (seg: string) => /^gocelular\.?$/i.test(seg)

function segmentos(storeName: string): string[] {
  return storeName
    .split(' - ')
    .map(s => s.trim())
    .filter(s => s !== '' && !esGocelular(s))
}

export function nombreMerchant(stores: StoreNombreRow[]): string | null {
  if (stores.length === 0) return null

  const orden = [...stores].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))

  const conNombre = orden.find(s => s.merchantName && s.merchantName.trim() !== '')
  if (conNombre) return conNombre.merchantName!.trim()

  const listas = orden.map(s => segmentos(s.storeName)).filter(l => l.length > 0)
  if (listas.length === 0) return null

  if (listas.length >= 2) {
    const [primera, ...resto] = listas
    const comun = primera.find(seg => resto.every(l => l.some(s => s.toLowerCase() === seg.toLowerCase())))
    if (comun) return comun

    // Sucursales numeradas ("Send 3", "Send 12"): prefijo común de palabras
    const palabras = listas.map(l => l[0].split(/\s+/))
    const prefijo: string[] = []
    for (let i = 0; i < palabras[0].length; i++) {
      const w = palabras[0][i]
      if (palabras.every(p => p[i]?.toLowerCase() === w.toLowerCase())) prefijo.push(w)
      else break
    }
    if (prefijo.length > 0) return prefijo.join(' ')
  }

  return listas[0][0]
}
