// Lógica pura de /upselling: clientes que terminaron de pagar todas las
// cuotas, su estado de contacto y la detección de recompra (una orden nueva
// creada DESPUÉS de la fecha en que se lo marcó contactado).

export interface OrdenPagaRaw {
  orderId: string
  userId: string
  nombre: string
  dni: string
  producto: string | null
  /** Fecha de la última cuota cobrada (ISO) */
  ultimaCuotaAt: string | null
  cuotas: number
  monto: number
}

export interface OrdenClienteRaw {
  orderId: string
  userId: string
  createdAt: string // ISO
  producto: string | null
}

export interface SeguimientoRaw {
  userId: string
  contactadoAt: string | null
  nota: string | null
}

export interface Recompra {
  orderId: string
  createdAt: string
  producto: string | null
}

export interface FilaUpselling {
  userId: string
  nombre: string
  dni: string
  telefono: string | null
  producto: string | null
  ultimaCuotaAt: string | null
  cuotas: number
  monto: number
  /** Cantidad de órdenes 100% pagas del cliente */
  ordenesPagas: number
  contactadoAt: string | null
  nota: string
  /** Primera orden creada después del contacto; null si no recompró o no fue contactado */
  recompra: Recompra | null
}

/**
 * Una fila por cliente: si tiene varias órdenes pagas se muestra la más
 * reciente (por última cuota) y se cuentan todas. La recompra solo se evalúa
 * para contactados: primera orden no descartada creada después de contactadoAt
 * que no sea una de sus órdenes ya pagas al momento del contacto.
 */
export function armarUpselling(
  pagas: OrdenPagaRaw[],
  telefonos: Record<string, string>,
  ordenes: OrdenClienteRaw[],
  seguimiento: SeguimientoRaw[],
): FilaUpselling[] {
  const seg = new Map(seguimiento.map(s => [s.userId, s]))
  const ordenesPorUser = new Map<string, OrdenClienteRaw[]>()
  for (const o of ordenes) {
    const lista = ordenesPorUser.get(o.userId) ?? []
    lista.push(o)
    ordenesPorUser.set(o.userId, lista)
  }

  const porUser = new Map<string, { principal: OrdenPagaRaw; cantidad: number; idsPagas: Set<string> }>()
  for (const p of pagas) {
    const prev = porUser.get(p.userId)
    if (!prev) {
      porUser.set(p.userId, { principal: p, cantidad: 1, idsPagas: new Set([p.orderId]) })
    } else {
      prev.cantidad++
      prev.idsPagas.add(p.orderId)
      if ((p.ultimaCuotaAt ?? '') > (prev.principal.ultimaCuotaAt ?? '')) prev.principal = p
    }
  }

  const filas: FilaUpselling[] = []
  for (const [userId, { principal, cantidad, idsPagas }] of porUser) {
    const s = seg.get(userId)
    const contactadoAt = s?.contactadoAt ?? null

    let recompra: Recompra | null = null
    if (contactadoAt) {
      const posteriores = (ordenesPorUser.get(userId) ?? [])
        .filter(o => o.createdAt > contactadoAt && !idsPagas.has(o.orderId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      if (posteriores.length > 0) {
        recompra = { orderId: posteriores[0].orderId, createdAt: posteriores[0].createdAt, producto: posteriores[0].producto }
      }
    }

    filas.push({
      userId,
      nombre: principal.nombre,
      dni: principal.dni,
      telefono: telefonos[userId] ?? null,
      producto: principal.producto,
      ultimaCuotaAt: principal.ultimaCuotaAt,
      cuotas: principal.cuotas,
      monto: principal.monto,
      ordenesPagas: cantidad,
      contactadoAt,
      nota: s?.nota ?? '',
      recompra,
    })
  }

  // Más recientes primero (los que acaban de terminar de pagar son los más calientes)
  return filas.sort((a, b) => (b.ultimaCuotaAt ?? '').localeCompare(a.ultimaCuotaAt ?? ''))
}

/**
 * Link de WhatsApp para un teléfono argentino: dígitos, prefijo 549 (los
 * celulares en wa.me van con 9 entre el país y el área).
 */
export function waLink(telefono: string): string {
  let d = telefono.replace(/\D/g, '')
  if (d.startsWith('549')) { /* ya está completo */ }
  else if (d.startsWith('54')) d = '549' + d.slice(2)
  else d = '549' + d
  return `https://wa.me/${d}`
}
