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
    marginBottom: 2,
  },
  headerDate: {
    fontSize: 9,
    color: '#9ca3af',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 9,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: 6,
    borderRadius: 4,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textTransform: 'uppercase',
    color: '#374151',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  colModelo: { flex: 3 },
  colCant: { flex: 1, textAlign: 'center' },
  colPrecioUnit: { flex: 2, textAlign: 'right' },
  colIva: { flex: 2, textAlign: 'right' },
  colSubtotal: { flex: 2, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: '#f9fafb',
    borderTopWidth: 2,
    borderTopColor: MAGENTA,
    marginTop: 4,
  },
  totalLabel: {
    flex: 6,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  totalValue: {
    flex: 2,
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: MAGENTA,
  },
  notas: {
    marginTop: 16,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  notasLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    marginBottom: 4,
  },
  notasText: {
    fontSize: 10,
    color: '#374151',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
  },
})

function formatARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export interface ProformaItemPDF {
  producto_nombre: string
  cantidad: number
  precio_venta_neto: number
  iva: number
  subtotal_con_iva: number
}

export interface ProformaPDFProps {
  nombre: string
  fecha: string
  items: ProformaItemPDF[]
  total_neto: number
  total_iva: number
  total_con_iva: number
  notas: string | null
}

export function ProformaPDF({ nombre, fecha, items, total_neto, total_iva, total_con_iva, notas }: ProformaPDFProps) {
  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Proforma</Text>
          <Text style={styles.headerSubtitle}>{nombre}</Text>
          <Text style={styles.headerDate}>{fecha}</Text>
        </View>

        {/* Info */}
        <View style={styles.infoRow}>
          <View>
            <Text style={styles.infoLabel}>GOcelular</Text>
            <Text style={styles.infoValue}>Cotización de productos</Text>
          </View>
          <View>
            <Text style={styles.infoLabel}>Total unidades</Text>
            <Text style={styles.infoValue}>{totalUnidades}</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colModelo]}>Modelo</Text>
          <Text style={[styles.tableHeaderCell, styles.colCant]}>Cant.</Text>
          <Text style={[styles.tableHeaderCell, styles.colPrecioUnit]}>P. Unit. Neto</Text>
          <Text style={[styles.tableHeaderCell, styles.colIva]}>IVA Unit.</Text>
          <Text style={[styles.tableHeaderCell, styles.colSubtotal]}>Subtotal c/IVA</Text>
        </View>

        {/* Items */}
        {items.map((item, index) => (
          <View
            key={`${item.producto_nombre}-${index}`}
            style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={styles.colModelo}>{item.producto_nombre}</Text>
            <Text style={styles.colCant}>{item.cantidad}</Text>
            <Text style={styles.colPrecioUnit}>{formatARS(item.precio_venta_neto)}</Text>
            <Text style={styles.colIva}>{formatARS(item.iva)}</Text>
            <Text style={[styles.colSubtotal, { fontFamily: 'Helvetica-Bold', color: MAGENTA }]}>
              {formatARS(item.subtotal_con_iva)}
            </Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            Total — {totalUnidades} unidades (Neto: {formatARS(total_neto)} + IVA: {formatARS(total_iva)})
          </Text>
          <Text style={styles.totalValue}>{formatARS(total_con_iva)}</Text>
        </View>

        {/* Notas */}
        {notas ? (
          <View style={styles.notas}>
            <Text style={styles.notasLabel}>OBSERVACIONES</Text>
            <Text style={styles.notasText}>{notas}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <Text style={styles.footer}>
          GOcelular — Proforma generada el {fecha}. Precios sujetos a cambio sin previo aviso.
        </Text>
      </Page>
    </Document>
  )
}
