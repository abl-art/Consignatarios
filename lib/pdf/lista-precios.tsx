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
  colModelo: {
    flex: 3,
  },
  colPrecioNeto: {
    flex: 2,
    textAlign: 'right',
  },
  colIva: {
    flex: 2,
    textAlign: 'right',
  },
  colPrecioConIva: {
    flex: 2,
    textAlign: 'right',
  },
  precioConIva: {
    fontFamily: 'Helvetica-Bold',
    color: MAGENTA,
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

export interface Producto {
  nombre: string
  precio_venta_neto: number
  iva: number
  precio_con_iva: number
}

export interface ListaPreciosPDFProps {
  productos: Producto[]
  fecha: string
}

export function ListaPreciosPDF({ productos, fecha }: ListaPreciosPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Lista de Precios — Celulares</Text>
          <Text style={styles.headerSubtitle}>GOcelular — Precios Mayoristas</Text>
          <Text style={styles.headerDate}>{fecha}</Text>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colModelo]}>Modelo</Text>
          <Text style={[styles.tableHeaderCell, styles.colPrecioNeto]}>Precio Neto</Text>
          <Text style={[styles.tableHeaderCell, styles.colIva]}>IVA 21%</Text>
          <Text style={[styles.tableHeaderCell, styles.colPrecioConIva]}>Precio con IVA</Text>
        </View>

        {/* Table rows */}
        {productos.map((producto, index) => (
          <View
            key={`${producto.nombre}-${index}`}
            style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={styles.colModelo}>{producto.nombre}</Text>
            <Text style={styles.colPrecioNeto}>{formatARS(producto.precio_venta_neto)}</Text>
            <Text style={styles.colIva}>{formatARS(producto.iva)}</Text>
            <Text style={[styles.colPrecioConIva, styles.precioConIva]}>
              {formatARS(producto.precio_con_iva)}
            </Text>
          </View>
        ))}

        {/* Footer */}
        <Text style={styles.footer}>
          GOcelular — Lista de precios generada el {fecha}. Precios sujetos a cambio sin previo aviso.
        </Text>
      </Page>
    </Document>
  )
}
