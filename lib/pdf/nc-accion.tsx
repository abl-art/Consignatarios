import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { FilaVentasAccion } from '@/lib/notas-credito'

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
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: '#f3f4f6',
    fontFamily: 'Helvetica-Bold',
  },
  colModelo: { flex: 1 },
  colCantidad: { width: 110, textAlign: 'right' },
  colCupo: { width: 80, textAlign: 'right' },
  sinVentas: { color: '#9ca3af' },
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

export interface NcAccionProps {
  marca: string
  proveedor: string
  desde?: string
  hasta?: string
  filas: FilaVentasAccion[]
  generadoEl: string
}

/** Renderiza el PDF a buffer (JSX acá para que el tipo cierre con react-pdf). */
export async function renderNcAccion(props: NcAccionProps): Promise<Buffer> {
  return renderToBuffer(<NcAccionPDF {...props} />)
}

export function NcAccionPDF({ marca, proveedor, desde, hasta, filas, generadoEl }: NcAccionProps) {
  const totalVendidas = filas.reduce((acc, f) => acc + f.vendidas, 0)
  const totalCupo = filas.reduce((acc, f) => acc + (f.cupo ?? 0), 0)
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Detalle de ventas — Acción {marca}</Text>
          <Text style={styles.headerSubtitle}>Nota de crédito {proveedor}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Proveedor</Text>
            <Text style={styles.metaValue}>{proveedor}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Vigencia de la acción</Text>
            <Text style={styles.metaValue}>
              {desde ? fechaLarga(desde) : '—'} al {hasta ? fechaLarga(hasta) : 'sin vencimiento'}
            </Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Unidades vendidas</Text>
            <Text style={styles.metaValue}>{totalVendidas}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Cupo total</Text>
            <Text style={styles.metaValue}>{totalCupo || '—'}</Text>
          </View>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={[styles.th, styles.colModelo]}>Modelo</Text>
          <Text style={[styles.th, styles.colCantidad]}>Cantidad vendida</Text>
          <Text style={[styles.th, styles.colCupo]}>Cupo</Text>
        </View>
        {filas.map((f, i) => (
          <View style={styles.row} key={`${f.modelo}-${i}`} wrap={false}>
            <Text style={styles.colModelo}>{f.modelo}</Text>
            <Text style={f.vendidas === 0 ? [styles.colCantidad, styles.sinVentas] : styles.colCantidad}>
              {f.vendidas}
            </Text>
            <Text style={f.cupo === null ? [styles.colCupo, styles.sinVentas] : styles.colCupo}>
              {f.cupo ?? '—'}
            </Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.colModelo}>Total</Text>
          <Text style={styles.colCantidad}>{totalVendidas}</Text>
          <Text style={styles.colCupo}>{totalCupo || '—'}</Text>
        </View>

        <View style={styles.footer}>
          <Text>
            Ventas propias en tienda GOcelular dentro de la vigencia de la acción.
          </Text>
          <Text style={{ marginTop: 2 }}>Generado el {fechaLarga(generadoEl)} — GOcelular / Grupo GO</Text>
        </View>
      </Page>
    </Document>
  )
}
