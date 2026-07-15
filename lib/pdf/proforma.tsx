import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const MAGENTA = '#E91E7B'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 30,
    color: '#1a1a1a',
  },
  // === Header tipo factura argentina ===
  headerContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  headerCenter: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  headerLetterBox: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLetter: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
  },
  headerLetterSub: {
    fontSize: 7,
    color: '#666',
    marginTop: 2,
  },
  headerRight: {
    flex: 1,
    padding: 10,
  },
  companyName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: MAGENTA,
    marginBottom: 2,
  },
  companyBrand: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 6,
  },
  companyDetail: {
    fontSize: 8,
    color: '#4b5563',
    marginBottom: 1,
  },
  docTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  docDetail: {
    fontSize: 9,
    color: '#374151',
    marginBottom: 2,
  },
  // === Datos del receptor ===
  receptorBox: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    marginBottom: 12,
  },
  receptorTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  receptorRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  receptorLabel: {
    fontSize: 9,
    color: '#6b7280',
    width: 100,
  },
  receptorValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
  },
  // === Tabla ===
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginBottom: 0,
  },
  tableHeaderCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textTransform: 'uppercase',
    color: '#374151',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 5,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e5e7eb',
  },
  tableRowAlt: {
    backgroundColor: '#fafafa',
  },
  colModelo: { flex: 3 },
  colCant: { flex: 1, textAlign: 'center' },
  colPrecioUnit: { flex: 2, textAlign: 'right' },
  colIva: { flex: 2, textAlign: 'right' },
  colSubtotal: { flex: 2, textAlign: 'right' },
  // === Totales ===
  totalsContainer: {
    marginTop: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#d1d5db',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  totalRowFinal: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f9fafb',
  },
  totalLabel: {
    flex: 8,
    textAlign: 'right',
    fontSize: 9,
    color: '#374151',
    paddingRight: 10,
  },
  totalValue: {
    flex: 2,
    textAlign: 'right',
    fontSize: 9,
  },
  totalLabelBold: {
    flex: 8,
    textAlign: 'right',
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    paddingRight: 10,
  },
  totalValueBold: {
    flex: 2,
    textAlign: 'right',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: MAGENTA,
  },
  // === Notas ===
  notas: {
    marginTop: 14,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  notasLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  notasText: {
    fontSize: 9,
    color: '#374151',
  },
  // === Footer ===
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 7,
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
  nroProforma: number | null
  clienteNombre: string
  clienteCuit: string
  clienteIva: string
  clienteDireccion: string
  fecha: string
  items: ProformaItemPDF[]
  total_neto: number
  total_iva: number
  total_con_iva: number
  notas: string | null
}

export function ProformaPDF({
  nombre, nroProforma, clienteNombre, clienteCuit, clienteIva, clienteDireccion,
  fecha, items, total_neto, total_iva, total_con_iva, notas,
}: ProformaPDFProps) {
  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* === Header tipo factura argentina === */}
        <View style={styles.headerContainer}>
          {/* Izquierda: datos del emisor */}
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>GOcelular</Text>
            <Text style={styles.companyBrand}>GO Servicios Digitales SAS</Text>
            <Text style={styles.companyDetail}>CUIT: 30-71632558-6</Text>
            <Text style={styles.companyDetail}>Domicilio: San Martin 4349, Unquillo, Córdoba</Text>
            <Text style={styles.companyDetail}>Condición IVA: Responsable Inscripto</Text>
          </View>

          {/* Centro: letra del comprobante */}
          <View style={styles.headerCenter}>
            <View style={styles.headerLetterBox}>
              <Text style={styles.headerLetter}>X</Text>
            </View>
            <Text style={styles.headerLetterSub}>No válido como factura</Text>
          </View>

          {/* Derecha: datos del documento */}
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>PROFORMA{nroProforma ? ` N° ${nroProforma}` : ''}</Text>
            <Text style={styles.docDetail}>Fecha: {fecha}</Text>
            <Text style={styles.docDetail}>Unidades: {totalUnidades}</Text>
          </View>
        </View>

        {/* === Datos del receptor === */}
        <View style={styles.receptorBox}>
          <Text style={styles.receptorTitle}>Datos del cliente</Text>
          <View style={styles.receptorRow}>
            <Text style={styles.receptorLabel}>Nombre / Razón social:</Text>
            <Text style={styles.receptorValue}>{clienteNombre || '—'}</Text>
          </View>
          {clienteCuit && (
            <View style={styles.receptorRow}>
              <Text style={styles.receptorLabel}>CUIT:</Text>
              <Text style={styles.receptorValue}>{clienteCuit}</Text>
            </View>
          )}
          {clienteIva && (
            <View style={styles.receptorRow}>
              <Text style={styles.receptorLabel}>Condición IVA:</Text>
              <Text style={styles.receptorValue}>{clienteIva === 'inscripto' ? 'Responsable Inscripto' : 'Monotributista'}</Text>
            </View>
          )}
          {clienteDireccion && (
            <View style={styles.receptorRow}>
              <Text style={styles.receptorLabel}>Domicilio:</Text>
              <Text style={styles.receptorValue}>{clienteDireccion}</Text>
            </View>
          )}
        </View>

        {/* === Tabla === */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colModelo]}>Descripción</Text>
          <Text style={[styles.tableHeaderCell, styles.colCant]}>Cant.</Text>
          <Text style={[styles.tableHeaderCell, styles.colPrecioUnit]}>P. Unit. Neto</Text>
          <Text style={[styles.tableHeaderCell, styles.colIva]}>IVA 21%</Text>
          <Text style={[styles.tableHeaderCell, styles.colSubtotal]}>Subtotal</Text>
        </View>

        {items.map((item, index) => (
          <View
            key={`${item.producto_nombre}-${index}`}
            style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={styles.colModelo}>{item.producto_nombre}</Text>
            <Text style={styles.colCant}>{item.cantidad}</Text>
            <Text style={styles.colPrecioUnit}>{formatARS(item.precio_venta_neto)}</Text>
            <Text style={styles.colIva}>{formatARS(item.iva)}</Text>
            <Text style={[styles.colSubtotal, { fontFamily: 'Helvetica-Bold' }]}>
              {formatARS(item.subtotal_con_iva)}
            </Text>
          </View>
        ))}

        {/* === Totales === */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal Neto</Text>
            <Text style={styles.totalValue}>{formatARS(total_neto)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>IVA 21%</Text>
            <Text style={styles.totalValue}>{formatARS(total_iva)}</Text>
          </View>
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalLabelBold}>TOTAL</Text>
            <Text style={styles.totalValueBold}>{formatARS(total_con_iva)}</Text>
          </View>
        </View>

        {/* === Notas === */}
        {notas ? (
          <View style={styles.notas}>
            <Text style={styles.notasLabel}>Observaciones</Text>
            <Text style={styles.notasText}>{notas}</Text>
          </View>
        ) : null}

        {/* === Footer === */}
        <Text style={styles.footer}>
          GOcelular — GO Servicios Digitales SAS — CUIT 30-71632558-6 — Documento no válido como factura — Generado el {fecha}
        </Text>
      </Page>
    </Document>
  )
}
