'use server'

// Cuenta corriente de proveedores de GOcelular según NetSuite (via Databricks).
// Las facturas de compra (VendBill) llevan la clasificación contable GO CELULAR (id 16);
// los pagos no llevan clasificación, se llega a ellos por la tabla puente de aplicaciones.

import { databricksQuery, dbNum } from '@/lib/databricks'

const CLASIFICACION_GO_CELULAR = 16

export interface ProveedorNS {
  vendorId: string
  nombre: string
  cuit: string | null
  facturas: number
  totalComprado: number
  totalPagado: number
  saldo: number
  ultimaFactura: string | null
}

export interface MovimientoNS {
  fecha: string
  tipo: 'Factura' | 'Pago' | 'Anticipo' | 'Otro'
  comprobante: string
  detalle: string
  debe: number
  haber: number
  saldo: number
}

export interface CtaCteNS {
  nombre: string
  cuit: string | null
  totalComprado: number
  totalPagado: number
  saldo: number
  movimientos: MovimientoNS[]
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export async function getProveedoresNS(desde?: string, hasta?: string): Promise<{ proveedores: ProveedorNS[]; error?: string }> {
  const filtroFechas = [
    desde && FECHA_RE.test(desde) ? `AND t.transaction_date >= '${desde}'` : '',
    hasta && FECHA_RE.test(hasta) ? `AND t.transaction_date <= '${hasta}'` : '',
  ].join('\n        ')
  try {
    const rows = await databricksQuery(`
      SELECT
        v.vendor_id,
        v.vendor_name,
        v.vendor_cuit,
        COUNT(*) AS facturas,
        SUM(ABS(t.accounting_transaction_total_amount)) AS total_comprado,
        SUM(t.accounting_transaction_paid_amount) AS total_pagado,
        SUM(t.accounting_transaction_unpaid_amount) AS saldo,
        MAX(t.transaction_date) AS ultima_factura
      FROM prd.gold_dw.fact_accounting_transactions t
      JOIN prd.gold_dw.dim_vendors v ON v.vendor_id = t.vendor_id
      WHERE t.accounting_transaction_classification_id = ${CLASIFICACION_GO_CELULAR}
        AND t.is_deleted = false
        AND t.is_reversal = false
        ${filtroFechas}
      GROUP BY v.vendor_id, v.vendor_name, v.vendor_cuit
      ORDER BY saldo DESC, total_comprado DESC
      LIMIT 500
    `)
    const proveedores: ProveedorNS[] = rows.map(r => ({
      vendorId: r.vendor_id ?? '',
      nombre: r.vendor_name ?? '(sin nombre)',
      cuit: r.vendor_cuit,
      facturas: dbNum(r.facturas),
      totalComprado: dbNum(r.total_comprado),
      totalPagado: dbNum(r.total_pagado),
      saldo: dbNum(r.saldo),
      ultimaFactura: r.ultima_factura,
    }))
    return { proveedores }
  } catch (e) {
    return { proveedores: [], error: e instanceof Error ? e.message : 'Error consultando Databricks' }
  }
}

export async function getCtaCteNS(vendorId: string): Promise<{ ctaCte: CtaCteNS | null; error?: string }> {
  const vid = Number(vendorId)
  if (!Number.isFinite(vid)) return { ctaCte: null, error: 'Proveedor inválido' }
  try {
    const [facturas, pagos] = await Promise.all([
      databricksQuery(`
        SELECT
          b.accounting_transaction_id AS id,
          b.transaction_date AS fecha,
          b.accounting_transaction_document_number AS doc,
          b.accounting_transaction_description AS detalle,
          ABS(b.accounting_transaction_total_amount) AS monto,
          b.accounting_transaction_unpaid_amount AS impago,
          v.vendor_name,
          v.vendor_cuit
        FROM prd.gold_dw.fact_accounting_transactions b
        JOIN prd.gold_dw.dim_vendors v ON v.vendor_id = b.vendor_id
        WHERE b.vendor_id = ${vid}
          AND b.accounting_transaction_classification_id = ${CLASIFICACION_GO_CELULAR}
          AND b.is_deleted = false
          AND b.is_reversal = false
        ORDER BY b.transaction_date
        LIMIT 2000
      `),
      databricksQuery(`
        SELECT
          pay.accounting_transaction_id AS pago_id,
          pay.transaction_date AS fecha,
          pay.accounting_transaction_type_id AS tipo,
          pay.accounting_transaction_document_number AS doc,
          SUM(p.accounting_transaction_applied_amount) AS aplicado,
          COUNT(DISTINCT b.accounting_transaction_id) AS facturas_aplicadas
        FROM prd.gold_dw.fact_accounting_transactions b
        JOIN prd.gold_dw.fact_accounting_transactions_payments p
          ON p.accounting_transaction_id = b.accounting_transaction_id
        JOIN prd.gold_dw.fact_accounting_transactions pay
          ON pay.accounting_transaction_id = p.related_accounting_transaction_id
        WHERE b.vendor_id = ${vid}
          AND b.accounting_transaction_classification_id = ${CLASIFICACION_GO_CELULAR}
          AND b.is_deleted = false
          AND b.is_reversal = false
          AND p.accounting_transaction_applied_amount > 0
        GROUP BY pay.accounting_transaction_id, pay.transaction_date, pay.accounting_transaction_type_id, pay.accounting_transaction_document_number
        ORDER BY fecha
        LIMIT 2000
      `),
    ])

    if (facturas.length === 0) return { ctaCte: null, error: 'El proveedor no tiene facturas GO CELULAR en NetSuite' }

    const movimientos: MovimientoNS[] = []
    for (const f of facturas) {
      movimientos.push({
        fecha: f.fecha ?? '',
        tipo: 'Factura',
        comprobante: f.doc ?? '—',
        detalle: f.detalle ?? '',
        debe: dbNum(f.monto),
        haber: 0,
        saldo: 0,
      })
    }
    for (const p of pagos) {
      const tipo = p.tipo === 'VendPymt' ? 'Pago' : p.tipo === 'Deposit' ? 'Anticipo' : 'Otro'
      const nFact = dbNum(p.facturas_aplicadas)
      movimientos.push({
        fecha: p.fecha ?? '',
        tipo,
        comprobante: p.doc ? `#${p.doc}` : '—',
        detalle: nFact > 1 ? `Aplicado a ${nFact} facturas` : '',
        debe: 0,
        haber: dbNum(p.aplicado),
        saldo: 0,
      })
    }
    // Orden cronológico; a igual fecha, primero la factura y después el pago
    movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === 'Factura' ? -1 : 1) - (b.tipo === 'Factura' ? -1 : 1))
    let saldo = 0
    for (const m of movimientos) {
      saldo += m.debe - m.haber
      m.saldo = saldo
    }

    const totalComprado = facturas.reduce((s, f) => s + dbNum(f.monto), 0)
    const totalPagado = pagos.reduce((s, p) => s + dbNum(p.aplicado), 0)
    return {
      ctaCte: {
        nombre: facturas[0].vendor_name ?? '(sin nombre)',
        cuit: facturas[0].vendor_cuit,
        totalComprado,
        totalPagado,
        saldo: facturas.reduce((s, f) => s + dbNum(f.impago), 0),
        movimientos,
      },
    }
  } catch (e) {
    return { ctaCte: null, error: e instanceof Error ? e.message : 'Error consultando Databricks' }
  }
}
