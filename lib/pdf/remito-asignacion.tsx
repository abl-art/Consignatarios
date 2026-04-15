import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

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
    borderBottomColor: '#2563eb',
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#2563eb',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 24,
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
  table: {
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
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
  colImei: { width: '30%' },
  colMarca: { width: '15%' },
  colModelo: { width: '25%' },
  colPrecio: { width: '15%', textAlign: 'right' },
  imeiText: {
    fontFamily: 'Courier',
    fontSize: 9,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 8,
  },
  totalBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 4,
    padding: 8,
    width: 140,
  },
  totalLabel: {
    fontSize: 8,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#2563eb',
  },
  signatureSection: {
    marginTop: 32,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  signatureBox: {
    alignItems: 'center',
    width: 180,
  },
  signatureImage: {
    width: 160,
    height: 60,
    objectFit: 'contain',
    marginBottom: 4,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    width: 160,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: '#6b7280',
  },
})

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(amount)
}

interface RemitoItem {
  imei: string
  marca: string
  modelo: string
  precioCosto: number
  precioVenta: number
}

interface RemitoAsignacionProps {
  fecha: string
  consignatario: string
  firmadoPor: string
  firmaBase64?: string
  items: RemitoItem[]
  totalCosto: number
  totalVenta: number
}

export function RemitoAsignacionPDF(props: RemitoAsignacionProps) {
  const { fecha, consignatario, firmadoPor, firmaBase64, items, totalCosto, totalVenta } = props

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GOcelular — Remito de Asignacion</Text>
          <Text style={styles.headerSubtitle}>Documento de entrega de mercaderia en consignacion</Text>
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Fecha</Text>
            <Text style={styles.metaValue}>{fecha}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Consignatario</Text>
            <Text style={styles.metaValue}>{consignatario}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Firmado por</Text>
            <Text style={styles.metaValue}>{firmadoPor}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Total unidades</Text>
            <Text style={styles.metaValue}>{items.length}</Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colImei]}>IMEI</Text>
            <Text style={[styles.tableHeaderCell, styles.colMarca]}>Marca</Text>
            <Text style={[styles.tableHeaderCell, styles.colModelo]}>Modelo</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrecio]}>P. Costo</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrecio]}>P. Venta</Text>
          </View>
          {items.map((item, index) => (
            <View
              key={item.imei}
              style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <Text style={[styles.imeiText, styles.colImei]}>{item.imei}</Text>
              <Text style={styles.colMarca}>{item.marca}</Text>
              <Text style={styles.colModelo}>{item.modelo}</Text>
              <Text style={styles.colPrecio}>{formatCurrency(item.precioCosto)}</Text>
              <Text style={styles.colPrecio}>{formatCurrency(item.precioVenta)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsRow}>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total Costo</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalCosto)}</Text>
          </View>
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total Venta</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalVenta)}</Text>
          </View>
        </View>

        {/* Signature */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            {firmaBase64 ? (
              <Image src={firmaBase64} style={styles.signatureImage} />
            ) : (
              <View style={[styles.signatureImage, { borderWidth: 1, borderColor: '#e5e7eb' }]} />
            )}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>{firmadoPor}</Text>
            <Text style={styles.signatureLabel}>Firma del consignatario</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
