import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { BonoRegistro } from '@/lib/lista-precios'
import type { VentaConFactura } from '@/lib/gocelular'

const MAGENTA = '#E91E7B'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 40,
    color: '#1a1a1a',
  },
  header: {
    marginBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: MAGENTA,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: MAGENTA,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 10,
  },
  metaBox: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    padding: 8,
  },
  metaLabel: {
    fontSize: 7,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: {
    color: '#ffffff',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  colNum: { width: 28 },
  colFecha: { width: 62 },
  colImei: { width: 110 },
  colModelo: { flex: 1 },
  colFactura: { width: 120 },
  pendiente: { color: '#b45309' },
  footer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    fontSize: 8,
    color: '#6b7280',
  },
})

function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const peso = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

export interface PruebaVentasBonoProps {
  bono: BonoRegistro
  ventas: VentaConFactura[]
  vendidasTotales: number
  generadoEl: string
}

/** Renderiza el PDF a buffer (JSX acá para que el tipo cierre con react-pdf). */
export async function renderPruebaVentasBono(props: PruebaVentasBonoProps): Promise<Buffer> {
  return renderToBuffer(<PruebaVentasBonoPDF {...props} />)
}

export function PruebaVentasBonoPDF({ bono, ventas, vendidasTotales, generadoEl }: PruebaVentasBonoProps) {
  const pendientes = ventas.filter(v => !v.factura).length
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Prueba de ventas — Bono sell-out</Text>
          <Text style={styles.headerSubtitle}>{bono.nombreModelo}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Bono por unidad (c/IVA)</Text>
            <Text style={styles.metaValue}>{peso(bono.monto)}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Vigencia</Text>
            <Text style={styles.metaValue}>
              {bono.desde ? fechaLarga(bono.desde) : '—'} al {bono.hasta ? fechaLarga(bono.hasta) : 'sin vencimiento'}
            </Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Cupo</Text>
            <Text style={styles.metaValue}>{bono.cupo ? `${bono.cupo} u.` : 'Sin cupo'}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Unidades listadas</Text>
            <Text style={styles.metaValue}>
              {ventas.length}
              {bono.cupo && vendidasTotales > ventas.length ? ` (de ${vendidasTotales} vendidas)` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={[styles.th, styles.colNum]}>#</Text>
          <Text style={[styles.th, styles.colFecha]}>Fecha</Text>
          <Text style={[styles.th, styles.colImei]}>IMEI</Text>
          <Text style={[styles.th, styles.colModelo]}>Modelo</Text>
          <Text style={[styles.th, styles.colFactura]}>Factura</Text>
        </View>
        {ventas.map((v, i) => (
          <View style={styles.row} key={`${v.imei}-${i}`} wrap={false}>
            <Text style={styles.colNum}>{i + 1}</Text>
            <Text style={styles.colFecha}>{fechaLarga(v.fecha)}</Text>
            <Text style={styles.colImei}>{v.imei}</Text>
            <Text style={styles.colModelo}>{v.modelo}</Text>
            <Text style={v.factura ? styles.colFactura : [styles.colFactura, styles.pendiente]}>
              {v.factura ?? 'pendiente de emisión'}
            </Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text>
            {ventas.length} unidades vendidas en tienda GOcelular dentro de la vigencia del bono
            {bono.cupo ? ` (cupo ${bono.cupo} u.)` : ''}.
            {pendientes > 0 ? ` ${pendientes} facturas pendientes de emisión al momento de generar este reporte.` : ''}
          </Text>
          <Text style={{ marginTop: 2 }}>Generado el {fechaLarga(generadoEl)} — GOcelular / Grupo GO</Text>
        </View>
      </Page>
    </Document>
  )
}
