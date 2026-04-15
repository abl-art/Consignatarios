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
    borderBottomColor: '#7c3aed',
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#7c3aed',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 16,
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
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  summaryBox: {
    flex: 1,
    borderRadius: 4,
    padding: 10,
    alignItems: 'center',
  },
  summaryBoxEsperados: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  summaryBoxPresentes: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  summaryBoxFaltantes: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  summaryNumber: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  summaryNumberEsperados: { color: '#2563eb' },
  summaryNumberPresentes: { color: '#16a34a' },
  summaryNumberFaltantes: { color: '#dc2626' },
  summaryLabel: {
    fontSize: 9,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  table: {
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#7c3aed',
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
  colModelo: { width: '30%' },
  colEstado: { width: '25%', textAlign: 'right' },
  imeiText: {
    fontFamily: 'Courier',
    fontSize: 9,
  },
  estadoPresente: {
    color: '#16a34a',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'right',
  },
  estadoFaltante: {
    color: '#dc2626',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'right',
  },
  observacionesSection: {
    marginTop: 12,
    marginBottom: 16,
    padding: 10,
    backgroundColor: '#fefce8',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  observacionesLabel: {
    fontSize: 8,
    color: '#92400e',
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  observacionesText: {
    fontSize: 10,
    color: '#78350f',
  },
  signatureSection: {
    marginTop: 24,
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

interface AuditoriaItemDisplay {
  imei: string
  marca: string
  modelo: string
  presente: boolean
}

interface ActaAuditoriaProps {
  fecha: string
  consignatario: string
  realizadaPor: string
  observaciones?: string | null
  firmaBase64?: string
  items: AuditoriaItemDisplay[]
}

export function ActaAuditoriaPDF(props: ActaAuditoriaProps) {
  const { fecha, consignatario, realizadaPor, observaciones, firmaBase64, items } = props

  const esperados = items.length
  const presentes = items.filter((i) => i.presente).length
  const faltantes = esperados - presentes

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GOcelular — Acta de Auditoria</Text>
          <Text style={styles.headerSubtitle}>Verificacion de inventario en consignacion</Text>
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
            <Text style={styles.metaLabel}>Auditada por</Text>
            <Text style={styles.metaValue}>{realizadaPor}</Text>
          </View>
        </View>

        {/* Summary boxes */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryBox, styles.summaryBoxEsperados]}>
            <Text style={[styles.summaryNumber, styles.summaryNumberEsperados]}>{esperados}</Text>
            <Text style={styles.summaryLabel}>Esperados</Text>
          </View>
          <View style={[styles.summaryBox, styles.summaryBoxPresentes]}>
            <Text style={[styles.summaryNumber, styles.summaryNumberPresentes]}>{presentes}</Text>
            <Text style={styles.summaryLabel}>Presentes</Text>
          </View>
          <View style={[styles.summaryBox, styles.summaryBoxFaltantes]}>
            <Text style={[styles.summaryNumber, styles.summaryNumberFaltantes]}>{faltantes}</Text>
            <Text style={styles.summaryLabel}>Faltantes</Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colImei]}>IMEI</Text>
            <Text style={[styles.tableHeaderCell, styles.colMarca]}>Marca</Text>
            <Text style={[styles.tableHeaderCell, styles.colModelo]}>Modelo</Text>
            <Text style={[styles.tableHeaderCell, styles.colEstado]}>Estado</Text>
          </View>
          {items.map((item, index) => (
            <View
              key={item.imei}
              style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <Text style={[styles.imeiText, styles.colImei]}>{item.imei}</Text>
              <Text style={styles.colMarca}>{item.marca}</Text>
              <Text style={styles.colModelo}>{item.modelo}</Text>
              <Text style={item.presente ? styles.estadoPresente : styles.estadoFaltante}>
                {item.presente ? 'Presente' : 'FALTANTE'}
              </Text>
            </View>
          ))}
        </View>

        {/* Observations */}
        {observaciones ? (
          <View style={styles.observacionesSection}>
            <Text style={styles.observacionesLabel}>Observaciones</Text>
            <Text style={styles.observacionesText}>{observaciones}</Text>
          </View>
        ) : null}

        {/* Signature */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBox}>
            {firmaBase64 ? (
              <Image src={firmaBase64} style={styles.signatureImage} />
            ) : (
              <View style={[styles.signatureImage, { borderWidth: 1, borderColor: '#e5e7eb' }]} />
            )}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>{realizadaPor}</Text>
            <Text style={styles.signatureLabel}>Firma del auditor</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
