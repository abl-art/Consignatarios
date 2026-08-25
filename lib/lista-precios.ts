// Lista de Precios (/canales/lista-precios): a partir del costo sin IVA del
// gestor de Compras y un múltiplo editable por modelo (default 2) calcula el
// PVP de la tienda. Regla de redondeo de Emiliano: la cuota (PVP÷9) cae en
// centenas redondas SIEMPRE hacia arriba → el PVP final es múltiplo de 900 y
// nunca queda abajo del objetivo costo×múltiplo.
//
// Costo: el proveedor preferido de cada marca (Mirgor→Samsung, Newsan→
// Motorola, Solnik→Xiaomi, Relojería Fueguina→Nubia); si no tiene precio
// para un modelo, el más barato del resto. Solo se listan modelos con ventas
// en los últimos 30 días.

import { normalizarModelo } from './inventario-indicadores'
import { normalizarMarca } from './marca'

export const MULTIPLO_DEFAULT = 2
const IVA = 1.21

export const PROVEEDOR_PREFERIDO: Record<string, string> = {
  Samsung: 'IATEC SAU (Mirgor sa)',
  Motorola: 'NEWSAN SA',
  Xiaomi: 'SOLNIK SA',
  Nubia: 'Industria Fueguina de Relojes SA',
}

export interface ProductoLista {
  id: string
  nombre: string
  codigo: string | null
}

export interface CostoProveedor {
  proveedor: string
  precio: number
}

export interface FilaListaPrecios {
  productoId: string
  nombre: string
  codigo: string | null
  marca: string
  proveedor: string | null
  proveedorPreferido: boolean
  costo: number | null
  multiplo: number
  pvp: number | null
  cuota: number | null
  mup: number | null
  mupPesos: number | null
  precioTienda: number | null
  diferencia: number | null
  ventas30d: number
}

function elegirCosto(marca: string, costos: CostoProveedor[]): { costo: CostoProveedor; preferido: boolean } | null {
  if (costos.length === 0) return null
  const preferido = costos.find(c => c.proveedor === PROVEEDOR_PREFERIDO[marca])
  if (preferido) return { costo: preferido, preferido: true }
  const masBarato = [...costos].sort((a, b) => a.precio - b.precio)[0]
  return { costo: masBarato, preferido: false }
}

function porClaveNormalizada(valores: Record<string, number>): Map<string, number> {
  const m = new Map<string, number>()
  for (const [nombre, valor] of Object.entries(valores)) {
    const clave = normalizarModelo(nombre)
    m.set(clave, (m.get(clave) ?? 0) + valor)
  }
  return m
}

export function armarListaPrecios(
  productos: ProductoLista[],
  costosPorProducto: Record<string, CostoProveedor[]>,
  multiplos: Record<string, number>,
  preciosTienda: Record<string, number>,
  ventas30dPorNombre: Record<string, number>,
): FilaListaPrecios[] {
  const tienda = porClaveNormalizada(preciosTienda)
  const ventas = porClaveNormalizada(ventas30dPorNombre)

  const filas: FilaListaPrecios[] = []
  for (const p of productos) {
    const clave = normalizarModelo(p.nombre)
    const ventas30d = ventas.get(clave) ?? 0
    if (ventas30d === 0) continue

    const marca = normalizarMarca(p.nombre.split(/\s+/)[0] ?? null) ?? '—'
    const eleccion = elegirCosto(marca, costosPorProducto[p.id] ?? [])
    const multiplo = multiplos[p.id] ?? MULTIPLO_DEFAULT
    const precioTienda = tienda.get(clave) ?? null

    let pvp: number | null = null
    let cuota: number | null = null
    let mup: number | null = null
    let mupPesos: number | null = null
    if (eleccion) {
      cuota = Math.ceil((eleccion.costo.precio * multiplo) / 9 / 100) * 100
      pvp = cuota * 9
      mup = pvp / IVA / eleccion.costo.precio
      mupPesos = pvp / IVA - eleccion.costo.precio
    }

    filas.push({
      productoId: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      marca,
      proveedor: eleccion?.costo.proveedor ?? null,
      proveedorPreferido: eleccion?.preferido ?? false,
      costo: eleccion?.costo.precio ?? null,
      multiplo,
      pvp,
      cuota,
      mup,
      mupPesos,
      precioTienda,
      diferencia: precioTienda !== null && pvp !== null ? precioTienda - pvp : null,
      ventas30d,
    })
  }

  return filas.sort((a, b) => a.marca.localeCompare(b.marca) || a.nombre.localeCompare(b.nombre))
}
