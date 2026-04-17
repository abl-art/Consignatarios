import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

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
  summaryBox: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    marginBottom: 16,
    overflow: 'hidden',
  },
  summaryItem: {
    flex: 1,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  summaryItemLast: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fdf2f8',
    borderWidth: 1,
    borderColor: MAGENTA,
    borderRadius: 4,
    margin: 4,
  },
  summaryLabel: {
    fontSize: 8,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
  },
  summaryValueHighlight: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: MAGENTA,
  },
  sucursalTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  table: {
    marginBottom: 4,
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
  subtotalRow: {
    flexDirection: 'row',
    padding: 5,
    backgroundColor: '#f3f4f6',
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    marginBottom: 8,
  },
  subtotalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: '#374151',
  },
  subtotalValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: MAGENTA,
    textAlign: 'right',
  },
  colFecha: { width: '14%' },
  colImei: { width: '28%' },
  colModelo: { width: '28%' },
  colMonto: { width: '15%', textAlign: 'right' },
  colComision: { width: '15%', textAlign: 'right' },
  colImeiDif: { width: '30%' },
  colModeloDif: { width: '40%' },
  colMontoDif: { width: '30%', textAlign: 'right' },
  imeiText: {
    fontFamily: 'Courier',
    fontSize: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 4,
  },
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export interface LiquidacionPDFProps {
  consignatario: string
  mes: string
  fechaEmision: string
  estado: string
  totalComisiones: number
  totalVentasMonto: number
  diferenciasDescontadas: number
  montoAPagar: number
  ventasPorSucursal: {
    sucursal: string
    ventas: { fecha: string; imei: string; marca: string; modelo: string; monto: number; comision: number }[]
  }[]
  diferencias: { fecha: string; imei: string; marca: string; modelo: string; monto: number }[]
  firmaBase64?: string
}

export function LiquidacionPDF(props: LiquidacionPDFProps) {
  const {
    consignatario,
    mes,
    fechaEmision,
    estado,
    totalComisiones,
    totalVentasMonto,
    diferenciasDescontadas,
    montoAPagar,
    ventasPorSucursal,
    diferencias,
    firmaBase64,
  } = props

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GOcelular — Liquidacion de Comisiones</Text>
          <Text style={styles.headerSubtitle}>Resumen mensual de ventas y comisiones en consignacion</Text>
        </View>

        {/* Meta boxes */}
        <View style={styles.metaRow}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Consignatario</Text>
            <Text style={styles.metaValue}>{consignatario}</Text>
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

        {/* Summary recuadro */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total ventas</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalVentasMonto)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total comisiones</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalComisiones)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Diferencias descontadas</Text>
            <Text style={styles.summaryValue}>
              {diferenciasDescontadas > 0 ? `−${formatCurrency(diferenciasDescontadas)}` : '—'}
            </Text>
          </View>
          <View style={styles.summaryItemLast}>
            <Text style={styles.summaryLabel}>Monto a pagar</Text>
            <Text style={styles.summaryValueHighlight}>{formatCurrency(montoAPagar)}</Text>
          </View>
        </View>

        {/* Per-sucursal sections */}
        {ventasPorSucursal.map((grupo) => {
          const subtotalMonto = grupo.ventas.reduce((s, v) => s + v.monto, 0)
          const subtotalComision = grupo.ventas.reduce((s, v) => s + v.comision, 0)
          return (
            <View key={grupo.sucursal}>
              <Text style={styles.sucursalTitle}>Sucursal: {grupo.sucursal}</Text>
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, styles.colFecha]}>Fecha</Text>
                  <Text style={[styles.tableHeaderCell, styles.colImei]}>IMEI</Text>
                  <Text style={[styles.tableHeaderCell, styles.colModelo]}>Modelo</Text>
                  <Text style={[styles.tableHeaderCell, styles.colMonto]}>Venta</Text>
                  <Text style={[styles.tableHeaderCell, styles.colComision]}>Comision</Text>
                </View>
                {grupo.ventas.map((v, index) => (
                  <View
                    key={`${v.imei}-${v.fecha}`}
                    style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                  >
                    <Text style={styles.colFecha}>{v.fecha}</Text>
                    <Text style={[styles.imeiText, styles.colImei]}>{v.imei}</Text>
                    <Text style={styles.colModelo}>{v.marca} {v.modelo}</Text>
                    <Text style={styles.colMonto}>{formatCurrency(v.monto)}</Text>
                    <Text style={styles.colComision}>{formatCurrency(v.comision)}</Text>
                  </View>
                ))}
                {/* Subtotal row */}
                <View style={styles.subtotalRow}>
                  <Text style={[styles.subtotalLabel, styles.colFecha]} />
                  <Text style={[styles.subtotalLabel, styles.colImei]} />
                  <Text style={[styles.subtotalLabel, styles.colModelo]}>Subtotal</Text>
                  <Text style={[styles.subtotalValue, styles.colMonto]}>{formatCurrency(subtotalMonto)}</Text>
                  <Text style={[styles.subtotalValue, styles.colComision]}>{formatCurrency(subtotalComision)}</Text>
                </View>
              </View>
            </View>
          )
        })}

        {/* Diferencias descontadas section */}
        {diferencias.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Diferencias descontadas</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.colImeiDif]}>IMEI</Text>
                <Text style={[styles.tableHeaderCell, styles.colModeloDif]}>Modelo</Text>
                <Text style={[styles.tableHeaderCell, styles.colMontoDif]}>Monto</Text>
              </View>
              {diferencias.map((d, index) => (
                <View
                  key={`${d.imei}-${index}`}
                  style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                >
                  <Text style={[styles.imeiText, styles.colImeiDif]}>{d.imei}</Text>
                  <Text style={styles.colModeloDif}>{d.marca} {d.modelo}</Text>
                  <Text style={[{ color: '#dc2626', textAlign: 'right' }, styles.colMontoDif]}>
                    −{formatCurrency(d.monto)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Grand total */}
        <View style={styles.grandTotalRow}>
          <View style={styles.grandTotalBox}>
            <Text style={styles.grandTotalLabel}>Total a pagar</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(montoAPagar)}</Text>
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
            <Text style={styles.signatureLabel}>{consignatario}</Text>
            <Text style={styles.signatureLabel}>Firma del consignatario</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
