'use server'

import { getPool } from '@/lib/db-pool'

export interface EtapaPromedio {
  minutos: number | null
  muestras: number
}

export interface SnapshotEtapa {
  cantidad: number
  promHoras: number | null
  maxHoras: number | null
}

export interface ModeloCantidad {
  modelo: string
  cantidad: number
}

export interface WarehouseSnapshot {
  enCola: SnapshotEtapa & { vencidos: number }
  pendientesPicking: SnapshotEtapa
  picking: {
    hoy: number
    ultimaHora: number
    ultimoHaceMin: number | null
    atascados: number
  }
  hoyFlujos: {
    ingresados: number
    enviadosWh: number
    expedidos: number
  }
  modelos: {
    enCola: ModeloCantidad[]
    pendientesPicking: ModeloCantidad[]
    pickeadosHoy: ModeloCantidad[]
  }
}

export interface WarehouseReport {
  snapshot: WarehouseSnapshot
  counts: {
    enCola: number
    enviado: number
    picking: number
    expedido: number
    cancelado: number
    requiereAtencion: number
  }
  etapas: {
    colaAEnviado: EtapaPromedio
    enviadoAPicking: EtapaPromedio
    pickingAExpedido: EtapaPromedio
    colaAExpedido: EtapaPromedio
    enviadoAExpedido: EtapaPromedio
  }
  expedidosPorDia: { dia: string; cantidad: number }[]
}

function promedio(valores: number[]): EtapaPromedio {
  if (valores.length === 0) return { minutos: null, muestras: 0 }
  const avg = valores.reduce((s, v) => s + v, 0) / valores.length
  return { minutos: Math.round(avg), muestras: valores.length }
}

/**
 * Reporte del warehouse de Andreani desde las tablas de GOcelular.
 * - Pipeline: cada etapa cuenta los pedidos que PASARON por ella durante el período.
 *   Timestamps por etapa: created_at (En Cola) → sent_at (Enviado) →
 *   webhook CUSTOMERORDERPACKED (Picking) → updated_at del pedido expedido (Expedido).
 * - Promedios: sobre las transiciones cuyo evento final cae dentro del período.
 * - Serie de expedidos: pedidos expedidos en el período según fecha de expedición.
 */
export async function getWarehouseReport(desdeISO: string, hastaISO: string): Promise<WarehouseReport> {
  const vacio: WarehouseReport = {
    snapshot: {
      enCola: { cantidad: 0, promHoras: null, maxHoras: null, vencidos: 0 },
      pendientesPicking: { cantidad: 0, promHoras: null, maxHoras: null },
      picking: { hoy: 0, ultimaHora: 0, ultimoHaceMin: null, atascados: 0 },
      hoyFlujos: { ingresados: 0, enviadosWh: 0, expedidos: 0 },
      modelos: { enCola: [], pendientesPicking: [], pickeadosHoy: [] },
    },
    counts: { enCola: 0, enviado: 0, picking: 0, expedido: 0, cancelado: 0, requiereAtencion: 0 },
    etapas: {
      colaAEnviado: { minutos: null, muestras: 0 },
      enviadoAPicking: { minutos: null, muestras: 0 },
      pickingAExpedido: { minutos: null, muestras: 0 },
      colaAExpedido: { minutos: null, muestras: 0 },
      enviadoAExpedido: { minutos: null, muestras: 0 },
    },
    expedidosPorDia: [],
  }

  const pool = getPool()
  if (!pool) return vacio

  const client = await pool.connect()
  try {
    const [pedidosRes, serieRes, snapshotRes, packedRes, modelosRes, modelosPackedRes, flujosRes] = await Promise.all([
      client.query<{
        estado: string
        created_at: Date
        sent_at: Date | null
        cancelled_at: Date | null
        updated_at: Date
        packed_at: Date | null
        expedido_at: Date | null
      }>(
        `SELECT
           p.estado::text,
           p.created_at,
           p.sent_at,
           p.cancelled_at,
           p.updated_at,
           w.packed_at,
           CASE WHEN p.estado = 'expedido' THEN p.updated_at END AS expedido_at
         FROM andreani_wh_pedidos p
         LEFT JOIN LATERAL (
           SELECT MIN(COALESCE((we.payload->>'fechaHoraGeneracion')::timestamptz, we.processed_at)) AS packed_at
           FROM andreani_wh_webhook_events we
           WHERE we.tipo = 'pedido' AND we.payload->>'ordenWh' = p.orden_wh
         ) w ON true
         WHERE (p.created_at >= $1 AND p.created_at < $2)
            OR (p.sent_at >= $1 AND p.sent_at < $2)
            OR (w.packed_at >= $1 AND w.packed_at < $2)
            OR (p.updated_at >= $1 AND p.updated_at < $2)`,
        [desdeISO, hastaISO]
      ),
      client.query<{ dia: string; cantidad: string }>(
        `SELECT
           to_char(p.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS dia,
           COUNT(*)::text AS cantidad
         FROM andreani_wh_pedidos p
         WHERE p.estado = 'expedido' AND p.updated_at >= $1 AND p.updated_at < $2
         GROUP BY 1
         ORDER BY 1`,
        [desdeISO, hastaISO]
      ),
      // Snapshot en tiempo real: pedidos actualmente en tránsito por el warehouse
      client.query<{
        estado: string
        created_at: Date
        sent_at: Date | null
        updated_at: Date
        dispatch_due_at: Date | null
      }>(
        `SELECT p.estado::text, p.created_at, p.sent_at, p.updated_at, p.dispatch_due_at
         FROM andreani_wh_pedidos p
         WHERE p.estado IN ('queued', 'sending', 'sent', 'picking')`
      ),
      // Actividad de picking en tiempo real (eventos CUSTOMERORDERPACKED, llegan con ~1 min de lag)
      client.query<{ hoy: string; ultima_hora: string; ultimo_hace_min: string | null }>(
        `SELECT
           COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
                                  = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)::text AS hoy,
           COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour')::text AS ultima_hora,
           ROUND((EXTRACT(EPOCH FROM (now() - MAX(created_at))) / 60)::numeric, 0)::text AS ultimo_hace_min
         FROM andreani_wh_webhook_events
         WHERE tipo = 'pedido'`
      ),
      // Modelos por etapa actual: items de los pedidos en cola y enviados
      client.query<{ grupo: string; modelo: string; cantidad: string }>(
        `SELECT
           CASE WHEN p.estado IN ('queued', 'sending') THEN 'cola' ELSE 'sent' END AS grupo,
           soi.display_name AS modelo,
           SUM(soi.quantity)::text AS cantidad
         FROM andreani_wh_pedidos p
         JOIN store_order_items soi ON soi.order_id = p.store_order_id
         WHERE p.estado IN ('queued', 'sending', 'sent')
         GROUP BY 1, 2
         ORDER BY 1, SUM(soi.quantity) DESC`
      ),
      // Modelos pickeados hoy: items de los pedidos con evento packed de hoy
      client.query<{ modelo: string; cantidad: string }>(
        `SELECT soi.display_name AS modelo, SUM(soi.quantity)::text AS cantidad
         FROM (
           SELECT DISTINCT p.id, p.store_order_id
           FROM andreani_wh_webhook_events we
           JOIN andreani_wh_pedidos p ON p.orden_wh = we.payload->>'ordenWh'
           WHERE we.tipo = 'pedido'
             AND (we.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
                 = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
         ) pd
         JOIN store_order_items soi ON soi.order_id = pd.store_order_id
         GROUP BY 1
         ORDER BY SUM(soi.quantity) DESC`
      ),
      // Flujos del día (hora AR): cuántos pedidos avanzaron de etapa hoy
      client.query<{ ingresados: string; enviados_wh: string; expedidos: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
                                  = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)::text AS ingresados,
           COUNT(*) FILTER (WHERE (sent_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
                                  = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)::text AS enviados_wh,
           COUNT(*) FILTER (WHERE estado = 'expedido'
                              AND (updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
                                  = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)::text AS expedidos
         FROM andreani_wh_pedidos`
      ),
    ])

    const counts = { enCola: 0, enviado: 0, picking: 0, expedido: 0, cancelado: 0, requiereAtencion: 0 }
    const colaAEnviado: number[] = []
    const enviadoAPicking: number[] = []
    const pickingAExpedido: number[] = []
    const colaAExpedido: number[] = []
    const enviadoAExpedido: number[] = []

    const desde = new Date(desdeISO).getTime()
    const hasta = new Date(hastaISO).getTime()
    const enRango = (d: Date | null): boolean => {
      if (!d) return false
      const t = new Date(d).getTime()
      return t >= desde && t < hasta
    }

    const difMin = (a: Date | null, b: Date | null): number | null => {
      if (!a || !b) return null
      const d = (new Date(b).getTime() - new Date(a).getTime()) / 60000
      return d >= 0 ? d : null
    }

    for (const p of pedidosRes.rows) {
      // Cada etapa cuenta los pedidos cuyo evento ocurrió dentro del período
      if (enRango(p.created_at)) counts.enCola++
      if (enRango(p.sent_at)) counts.enviado++
      if (enRango(p.packed_at)) counts.picking++
      if (p.estado === 'expedido' && enRango(p.expedido_at)) counts.expedido++
      if ((p.estado === 'cancelled' || p.estado === 'cancel_requested') && enRango(p.cancelled_at ?? p.updated_at)) counts.cancelado++
      if (p.estado === 'requires_attention' && enRango(p.updated_at)) counts.requiereAtencion++

      // Promedios: la transición cuenta si su evento final cae en el período
      if (enRango(p.sent_at)) {
        const d = difMin(p.created_at, p.sent_at)
        if (d !== null) colaAEnviado.push(d)
      }
      if (enRango(p.packed_at)) {
        const d = difMin(p.sent_at, p.packed_at)
        if (d !== null) enviadoAPicking.push(d)
      }
      if (enRango(p.expedido_at)) {
        const d3 = difMin(p.packed_at, p.expedido_at)
        if (d3 !== null) pickingAExpedido.push(d3)
        const d4 = difMin(p.created_at, p.expedido_at)
        if (d4 !== null) colaAExpedido.push(d4)
        const d5 = difMin(p.sent_at, p.expedido_at)
        if (d5 !== null) enviadoAExpedido.push(d5)
      }
    }

    // Snapshot en tiempo real
    const ahora = Date.now()
    const horasDesde = (d: Date | null): number | null =>
      d ? (ahora - new Date(d).getTime()) / 3600000 : null

    const resumen = (horas: number[]): SnapshotEtapa => ({
      cantidad: horas.length,
      promHoras: horas.length ? Math.round((horas.reduce((s, h) => s + h, 0) / horas.length) * 10) / 10 : null,
      maxHoras: horas.length ? Math.round(Math.max(...horas) * 10) / 10 : null,
    })

    const colaHoras: number[] = []
    const sentHoras: number[] = []
    let vencidos = 0
    let atascados = 0

    for (const p of snapshotRes.rows) {
      if (p.estado === 'queued' || p.estado === 'sending') {
        const h = horasDesde(p.created_at)
        if (h !== null) colaHoras.push(h)
        if (p.dispatch_due_at && new Date(p.dispatch_due_at).getTime() < ahora) vencidos++
      } else if (p.estado === 'sent') {
        const h = horasDesde(p.sent_at ?? p.updated_at)
        if (h !== null) sentHoras.push(h)
      } else if (p.estado === 'picking') {
        // Estado transicional (packed → expedido, mediana 2 min): si lleva más de 1h, está atascado
        const h = horasDesde(p.updated_at)
        if (h !== null && h > 1) atascados++
      }
    }

    const packed = packedRes.rows[0]

    return {
      snapshot: {
        enCola: { ...resumen(colaHoras), vencidos },
        pendientesPicking: resumen(sentHoras),
        picking: {
          hoy: Number(packed?.hoy ?? 0),
          ultimaHora: Number(packed?.ultima_hora ?? 0),
          ultimoHaceMin: packed?.ultimo_hace_min !== null && packed?.ultimo_hace_min !== undefined ? Number(packed.ultimo_hace_min) : null,
          atascados,
        },
        hoyFlujos: {
          ingresados: Number(flujosRes.rows[0]?.ingresados ?? 0),
          enviadosWh: Number(flujosRes.rows[0]?.enviados_wh ?? 0),
          expedidos: Number(flujosRes.rows[0]?.expedidos ?? 0),
        },
        modelos: {
          enCola: modelosRes.rows
            .filter(r => r.grupo === 'cola')
            .map(r => ({ modelo: r.modelo, cantidad: Number(r.cantidad) })),
          pendientesPicking: modelosRes.rows
            .filter(r => r.grupo === 'sent')
            .map(r => ({ modelo: r.modelo, cantidad: Number(r.cantidad) })),
          pickeadosHoy: modelosPackedRes.rows.map(r => ({ modelo: r.modelo, cantidad: Number(r.cantidad) })),
        },
      },
      counts,
      etapas: {
        colaAEnviado: promedio(colaAEnviado),
        enviadoAPicking: promedio(enviadoAPicking),
        pickingAExpedido: promedio(pickingAExpedido),
        colaAExpedido: promedio(colaAExpedido),
        enviadoAExpedido: promedio(enviadoAExpedido),
      },
      expedidosPorDia: serieRes.rows.map(r => ({ dia: r.dia, cantidad: Number(r.cantidad) })),
    }
  } finally {
    client.release()
  }
}
