'use server'

import { getPool } from '@/lib/db-pool'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluarIngreso } from '@/lib/ingreso-stock'
import type { Pedido } from '@/lib/actions/compras'

interface IngresoRow {
  purchase_reference: string
  imeis_totales: string
  imeis_ingresados: string
  fecha_devices: Date | null
  addons_totales: string | null
  addons_ingresados: string | null
  fecha_addons: Date | null
}

// Cruza los pedidos informados a GOcelular contra su DB: los IMEIs del intake que ya
// aparecen en inventory_items (celulares) y las cantidades recibidas por Andreani en
// inventory_intake_addon_items (accesorios). Cuando el ingreso esta completo marca el
// pedido como recibido e ingresado al stock con la fecha real del deposito; si es
// parcial guarda el progreso para mostrarlo en el gestor. Best-effort al cargar la
// pagina, como syncKitsGocelular: cualquier error se loguea y no rompe la carga.
export async function sincronizarIngresosGocelular(): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('flujo_config').select('key, value').like('key', 'pedido_%')
    if (!data) return

    const pendientes: Pedido[] = []
    for (const row of data) {
      try {
        const p = JSON.parse(row.value) as Pedido
        if (p.gocelular?.estado === 'informado' && !p.ingresoStockAt) pendientes.push(p)
      } catch {
        // JSON invalido: lo ignoramos aca, no es responsabilidad de este sync
      }
    }
    if (pendientes.length === 0) return

    const pool = getPool()
    if (!pool) return
    const client = await pool.connect()
    let rows: IngresoRow[]
    try {
      const res = await client.query<IngresoRow>(
        `SELECT pi.purchase_reference,
                COALESCE(d.total, 0) AS imeis_totales,
                COALESCE(d.ingresados, 0) AS imeis_ingresados,
                d.ultimo AS fecha_devices,
                a.total AS addons_totales,
                a.ingresados AS addons_ingresados,
                a.ultimo AS fecha_addons
         FROM purchase_intakes pi
         LEFT JOIN LATERAL (
           -- Ingresado = la fila existe y ya no esta en transito: GOcelular crea los items
           -- como in_transit_andreani al confirmar la compra y los pasa a andreani_wh (con
           -- andreani_received_at) recien cuando Andreani los recibe; destino local nace en 'local'
           SELECT count(*) AS total,
                  count(inv.imei) FILTER (WHERE inv.physical_location IS DISTINCT FROM 'in_transit_andreani') AS ingresados,
                  max(COALESCE(inv.andreani_received_at, inv.created_at))
                    FILTER (WHERE inv.physical_location IS DISTINCT FROM 'in_transit_andreani') AS ultimo
           FROM (
             SELECT jsonb_array_elements_text(COALESCE(l->'imeis', '[]'::jsonb)) AS imei
             FROM jsonb_array_elements(pi.source_payload->'lines') l
           ) x
           LEFT JOIN inventory_items inv ON inv.imei = x.imei
         ) d ON true
         LEFT JOIN LATERAL (
           SELECT sum(ai.quantity) AS total,
                  sum(LEAST(ai.received_quantity, ai.quantity)) AS ingresados,
                  max(ai.received_at) AS ultimo
           FROM inventory_intake_addon_items ai
           WHERE ai.batch_id = pi.addon_batch_id
         ) a ON true
         WHERE pi.purchase_reference = ANY($1)
         ORDER BY pi.created_at DESC`,
        [pendientes.map(p => p.id)]
      )
      rows = res.rows
    } finally {
      client.release()
    }

    // Con intakes duplicados por referencia (no deberia pasar) gana el mas reciente
    const porRef = new Map<string, IngresoRow>()
    for (const r of rows) {
      if (!porRef.has(r.purchase_reference)) porRef.set(r.purchase_reference, r)
    }

    for (const pedido of pendientes) {
      const r = porRef.get(pedido.id)
      if (!r) continue

      const ev = evaluarIngreso({
        imeisTotales: Number(r.imeis_totales),
        imeisIngresados: Number(r.imeis_ingresados),
        addonsTotales: Number(r.addons_totales ?? 0),
        addonsIngresados: Number(r.addons_ingresados ?? 0),
      })

      const g = pedido.gocelular!
      const progresoCambio = g.unidadesIngresadas !== ev.unidadesIngresadas || g.unidadesTotales !== ev.unidadesTotales
      if (!ev.completo && !progresoCambio) continue

      g.unidadesIngresadas = ev.unidadesIngresadas
      g.unidadesTotales = ev.unidadesTotales
      if (ev.completo) {
        const fechas = [r.fecha_devices, r.fecha_addons].filter((f): f is Date => f != null)
        const fecha = fechas.length > 0
          ? new Date(Math.max(...fechas.map(f => f.getTime()))).toISOString()
          : new Date().toISOString()
        g.ingresoDetectadoAt = fecha
        if (!pedido.entregadoAt) pedido.entregadoAt = fecha
        pedido.ingresoStockAt = fecha
      }

      // Upsert directo sin revalidatePath: este sync corre durante el render de la
      // pagina del gestor (force-dynamic), que ya lee los pedidos despues del sync
      const { error } = await supabase.from('flujo_config').upsert({
        key: `pedido_${pedido.id}`,
        value: JSON.stringify(pedido),
        updated_at: new Date().toISOString(),
      })
      if (error) console.error(`sincronizarIngresosGocelular: fallo el upsert de pedido_${pedido.id}`, error)
    }
  } catch (e) {
    console.error('sincronizarIngresosGocelular:', e)
  }
}
