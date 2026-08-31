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

// Bono sell-out de la marca: monto fijo CON IVA definido a nivel PVP, por
// modelo y por plazo. Se descuenta del PVP; la NC que llega de la marca es el
// bono neto de IVA y del margen (÷1,21 ÷MUP = bono ÷ múltiplo) — la marca
// cubre la parte del costo, el margen lo absorbe GOcelular.
export interface BonoModelo {
  monto: number
  desde?: string // ISO yyyy-mm-dd; sin desde = ya vigente
  hasta?: string // ISO yyyy-mm-dd inclusive; sin hasta = sin vencimiento
  cupo?: number // unidades máximas que la marca reconoce; sin cupo = ilimitado
}

// Venta propia (tienda GOcelular) por día y modelo: para contar contra el cupo
export interface VentaPropiaDiaria {
  fecha: string // ISO yyyy-mm-dd
  modelo: string
  ventas: number
}

/**
 * Las unidades que la marca reconoce para la NC son las primeras `cupo`
 * vendidas dentro de la vigencia, en orden de fecha. Sin cupo van todas.
 */
export function recortarVentasACupo<T extends { fecha: string }>(ventas: T[], cupo?: number): T[] {
  const ordenadas = [...ventas].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return cupo && cupo > 0 ? ordenadas.slice(0, cupo) : ordenadas
}

// Item de la pestaña ToDo de /notas (flujo_config 'app_todos', por fecha)
export interface TodoNotas {
  id: string
  text: string
  done: boolean
  prioridad?: 'normal' | 'negrita' | 'urgente'
}

const DIAS_RECLAMO_NC = 40

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Sábado → lunes (+2), domingo → lunes (+1): los recordatorios caen en día hábil
function aDiaHabil(iso: string): string {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay()
  if (dow === 6) return sumarDias(iso, 2)
  if (dow === 0) return sumarDias(iso, 1)
  return iso
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

/**
 * Sincroniza los recordatorios del bono en los ToDos de /notas, ambos
 * urgentes (rojo y negrita) y siempre en día hábil (finde → lunes):
 *   - "Vto BONO <modelo>" el día del vencimiento (reajustar precios)
 *   - "NC bono del <vto> ($monto) — <modelo>" 40 días después (reclamar la NC)
 *
 * El id lleva el vencimiento (bono-<id>-<hasta>): cada bono es un registro
 * propio. Mientras el bono está vigente sus pendientes se mudan/actualizan al
 * editarlo y se borran al quitarlo; cuando el bono VENCE quedan FIJOS para
 * siempre — un bono nuevo del mismo modelo no pisa la historia del anterior.
 * Los marcados hechos nunca se tocan.
 */
export function aplicarTodoBono(
  todos: Record<string, TodoNotas[]>,
  productoId: string,
  nombreModelo: string,
  hasta: string | undefined,
  monto?: number,
  hoy: Date = new Date(),
): Record<string, TodoNotas[]> {
  const hoyIso = hoy.toISOString().slice(0, 10)
  // Bono ya vencido: su historia está congelada, no se toca nada
  if (hasta && hasta < hoyIso) return todos

  const montoTxt = monto ? ` ($${monto.toLocaleString('es-AR')})` : ''
  const entradas: { id: string; fecha: string; texto: string }[] = hasta
    ? [
        { id: `bono-${productoId}-${hasta}`, fecha: aDiaHabil(hasta), texto: `Vto BONO ${nombreModelo}` },
        {
          id: `bono-nc-${productoId}-${hasta}`,
          fecha: aDiaHabil(sumarDias(hasta, DIAS_RECLAMO_NC)),
          texto: `NC bono del ${fechaCorta(hasta)}${montoTxt} — ${nombreModelo}`,
        },
      ]
    : []

  // ids de este producto: bono-<id>[-fecha] / bono-nc-<id>[-fecha] (sin fecha = formato viejo)
  const idRe = new RegExp(`^bono(?:-nc)?-${productoId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-(\\d{4}-\\d{2}-\\d{2}))?$`)
  const esRemovible = (t: TodoNotas, fecha: string): boolean => {
    if (t.done) return false
    const m = t.id.match(idRe)
    if (!m) return false
    const vtoEmbebido = m[1]
    if (vtoEmbebido && vtoEmbebido < hoyIso) return false // bono vencido: fijo
    // pendiente de bono vigente (o formato viejo): se remueve salvo que sea
    // exactamente la entrada actual en su lugar correcto
    return !entradas.some(e => e.id === t.id && e.fecha === fecha)
  }

  const resultado: Record<string, TodoNotas[]> = {}
  for (const [fecha, items] of Object.entries(todos)) {
    resultado[fecha] = Array.isArray(items) ? items.filter(t => !esRemovible(t, fecha)) : items
  }
  for (const e of entradas) {
    const items = Array.isArray(resultado[e.fecha]) ? resultado[e.fecha] : []
    const existente = items.find(t => t.id === e.id)
    if (existente) {
      existente.text = e.texto
    } else {
      resultado[e.fecha] = [...items, { id: e.id, text: e.texto, done: false, prioridad: 'urgente' }]
    }
  }
  return resultado
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
  fijado: boolean // agregado a mano por el desplegable (aparece aunque no venda)
  bonoMonto: number | null
  bonoDesde: string | null
  bonoHasta: string | null
  bonoCupo: number | null
  bonoVendidas: number | null
  bonoEstado: 'vigente' | 'agotado' | null
  pvpConBono: number | null
  cuotaConBono: number | null
  ncEsperada: number | null
}

/**
 * Costo de referencia de un modelo: el proveedor preferido de la marca aunque
 * no sea el más barato; sin precio ahí, el más barato del resto. Compartida
 * entre la Lista de Precios y el Costo de Reposición de la valorización.
 */
export function elegirCosto(marca: string, costos: CostoProveedor[]): { costo: CostoProveedor; preferido: boolean } | null {
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

// Vendidas propias del modelo dentro de la vigencia (hasta inclusive); solo
// tiene sentido con cupo — sin cupo no se cuenta nada.
function contarVendidasBono(bono: BonoModelo, claveModelo: string, ventasPropias: VentaPropiaDiaria[]): number {
  let n = 0
  for (const v of ventasPropias) {
    if (normalizarModelo(v.modelo) !== claveModelo) continue
    if (bono.desde && v.fecha < bono.desde) continue
    if (bono.hasta && v.fecha > bono.hasta) continue
    n += v.ventas
  }
  return n
}

// Bono como registro de la tabla lista_precios_bonos: cada campaña es una fila
// propia con historia (los vencidos no se pisan) y su PDF de prueba de ventas.
export interface BonoRegistro extends BonoModelo {
  id: string
  productoId: string
  nombreModelo: string
  pdfUrl?: string | null
  pdfGeneradoAt?: string | null
}

export interface FilaHistorialBono extends BonoRegistro {
  estado: EstadoBono
  vendidas: number
  reconocidas: number // min(vendidas, cupo); sin cupo, todas
  ncUnitaria: number // monto ÷ múltiplo (neto de IVA y margen)
  ncTotal: number
}

/**
 * Filas de la pestaña Bonos: cada campaña con su estado, unidades vendidas en
 * la vigencia, las que la marca reconoce y la NC total esperada. Más recientes
 * primero.
 */
export function armarHistorialBonos(
  registros: BonoRegistro[],
  ventasPropias: VentaPropiaDiaria[],
  multiplos: Record<string, number>,
  hoy: Date = new Date(),
): FilaHistorialBono[] {
  return registros
    .map(r => {
      const clave = normalizarModelo(r.nombreModelo)
      const vendidas = contarVendidasBono(r, clave, ventasPropias)
      const reconocidas = r.cupo ? Math.min(vendidas, r.cupo) : vendidas
      const ncUnitaria = r.monto / (multiplos[r.productoId] ?? MULTIPLO_DEFAULT)
      return {
        ...r,
        estado: estadoBono(r, vendidas, hoy),
        vendidas,
        reconocidas,
        ncUnitaria,
        ncTotal: reconocidas * ncUnitaria,
      }
    })
    .sort((a, b) => (b.desde ?? '').localeCompare(a.desde ?? ''))
}

export type EstadoBono = 'futuro' | 'vigente' | 'agotado' | 'vencido'

export function estadoBono(bono: BonoModelo, vendidas: number, hoy: Date): EstadoBono {
  const dia = hoy.toISOString().slice(0, 10)
  if (bono.desde && dia < bono.desde) return 'futuro'
  if (bono.hasta && dia > bono.hasta) return 'vencido'
  if (bono.cupo && vendidas >= bono.cupo) return 'agotado'
  return 'vigente'
}

export function armarListaPrecios(
  productos: ProductoLista[],
  costosPorProducto: Record<string, CostoProveedor[]>,
  multiplos: Record<string, number>,
  preciosTienda: Record<string, number>,
  ventas30dPorNombre: Record<string, number>,
  bonos: Record<string, BonoModelo> = {},
  hoy: Date = new Date(),
  ventasPropiasDiarias: VentaPropiaDiaria[] = [],
  incluidos: string[] = [],
): FilaListaPrecios[] {
  const tienda = porClaveNormalizada(preciosTienda)
  const ventas = porClaveNormalizada(ventas30dPorNombre)
  const fijados = new Set(incluidos)

  const filas: FilaListaPrecios[] = []
  for (const p of productos) {
    const clave = normalizarModelo(p.nombre)
    const ventas30d = ventas.get(clave) ?? 0
    if (ventas30d === 0 && !fijados.has(p.id)) continue

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

    const bonoDef = bonos[p.id]
    let bono: BonoModelo | null = null
    let bonoCupo: number | null = null
    let bonoVendidas: number | null = null
    let bonoEstado: 'vigente' | 'agotado' | null = null
    if (bonoDef && bonoDef.monto > 0) {
      const vendidas = bonoDef.cupo ? contarVendidasBono(bonoDef, clave, ventasPropiasDiarias) : 0
      const estado = estadoBono(bonoDef, vendidas, hoy)
      if (estado === 'vigente') {
        bono = bonoDef
        bonoEstado = 'vigente'
      } else if (estado === 'agotado') {
        bonoEstado = 'agotado'
      }
      if (bonoDef.cupo && (estado === 'vigente' || estado === 'agotado')) {
        bonoCupo = bonoDef.cupo
        bonoVendidas = vendidas
      }
    }
    let pvpConBono: number | null = null
    let cuotaConBono: number | null = null
    let ncEsperada: number | null = null
    if (bono && pvp !== null) {
      cuotaConBono = Math.ceil((pvp - bono.monto) / 9 / 100) * 100
      pvpConBono = cuotaConBono * 9
      ncEsperada = bono.monto / multiplo
    }
    const pvpVigente = pvpConBono ?? pvp

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
      diferencia: precioTienda !== null && pvpVigente !== null ? precioTienda - pvpVigente : null,
      ventas30d,
      fijado: fijados.has(p.id),
      bonoMonto: bono && pvp !== null ? bono.monto : null,
      bonoDesde: bono && pvp !== null ? bono.desde ?? null : null,
      bonoHasta: bono && pvp !== null ? bono.hasta ?? null : null,
      bonoCupo,
      bonoVendidas,
      bonoEstado,
      pvpConBono,
      cuotaConBono,
      ncEsperada,
    })
  }

  return filas.sort((a, b) => a.marca.localeCompare(b.marca) || a.nombre.localeCompare(b.nombre))
}
