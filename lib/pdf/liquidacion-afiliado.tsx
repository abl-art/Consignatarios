import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const MAGENTA = '#E91E7B'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    color: '#1a1a1a',
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: MAGENTA,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: MAGENTA,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  metaBox: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    padding: 8,
  },
  metaLabel: {
    fontSize: 8,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  estadoBadge: {
    backgroundColor: MAGENTA,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  estadoBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
  },
  table: {
    marginBottom: 4,
    marginTop: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: MAGENTA,
    padding: 6,
    borderRadius: 4,
    marginBottom: 2,
  },
  tableHeaderCell: {
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRowAlt: {
    backgroundColor: '#f9fafb',
  },
  colFecha: { width: '15%' },
  colProducto: { width: '40%' },
  colPrecio: { width: '15%', textAlign: 'right' },
  colNeto: { width: '15%', textAlign: 'right' },
  colComision: { width: '15%', textAlign: 'right' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  grandTotalBox: {
    backgroundColor: '#fdf2f8',
    borderWidth: 2,
    borderColor: MAGENTA,
    borderRadius: 6,
    padding: 12,
    minWidth: 180,
    alignItems: 'flex-end',
  },
  grandTotalLabel: {
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  grandTotalValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: MAGENTA,
  },
})

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export interface LiquidacionAfiliadoPDFProps {
  afiliado: string
  mes: string
  fechaEmision: string
  estado: string
  totalComisiones: number
  montoAPagar: number
  ventas: {
    fecha: string
    producto: string
    precio: number
    comision: number
  }[]
}

export function LiquidacionAfiliadoPDF(props: LiquidacionAfiliadoPDFProps) {
  const { afiliado, mes, fechaEmision, estado, totalComisiones, montoAPagar, ventas } = props

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GOcelular — Liquidacion de Comisiones (Afiliado)</Text>
          <Text style={styles.headerSubtitle}>Resumen mensual de ventas y comisiones de afiliado</Text>
        </View>

        {/* Meta boxes */}
        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Afiliado</Text>
            <Text style={styles.metaValue}>{afiliado}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Mes</Text>
            <Text style={styles.metaValue}>{mes}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Fecha emision</Text>
            <Text style={styles.metaValue}>{fechaEmision}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Estado</Text>
            <View style={styles.estadoBadge}>
              <Text style={styles.estadoBadgeText}>{estado}</Text>
            </View>
          </View>
        </View>

        {/* Ventas table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colFecha]}>Fecha</Text>
            <Text style={[styles.tableHeaderCell, styles.colProducto]}>Producto</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrecio]}>Precio</Text>
            <Text style={[styles.tableHeaderCell, styles.colNeto]}>Neto s/IVA</Text>
            <Text style={[styles.tableHeaderCell, styles.colComision]}>Comision</Text>
          </View>
          {ventas.map((v, index) => (
            <View
              key={`${v.fecha}-${v.producto}-${index}`}
              style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <Text style={styles.colFecha}>{v.fecha}</Text>
              <Text style={styles.colProducto}>{v.producto}</Text>
              <Text style={styles.colPrecio}>{formatCurrency(v.precio)}</Text>
              <Text style={styles.colNeto}>{formatCurrency(v.precio / 1.21)}</Text>
              <Text style={styles.colComision}>{formatCurrency(v.comision)}</Text>
            </View>
          ))}
        </View>

        {/* Grand total */}
        <View style={styles.grandTotalRow}>
          <View style={styles.grandTotalBox}>
            <Text style={styles.grandTotalLabel}>Total a pagar</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(montoAPagar)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
