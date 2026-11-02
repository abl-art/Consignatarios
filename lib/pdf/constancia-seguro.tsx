import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { fechaCorta } from '@/lib/seguros-mail'

// Constancia de Cobertura del seguro por robo, replicando el modelo de Sancor
// (Downloads/jk13zbfw.lan.pdf, asegurado BRITO) según las respuestas del
// broker vía Emiliano (1/11/2026):
//  - Póliza colectiva: "2980394 2222" (la del modelo, PROVISORIA hasta que
//    Emiliano confirme la definitiva).
//  - Ref = nuestro número de certificado correlativo.
//  - Formato tal cual el modelo: asegurador Sancor, productor ASEGURALO
//    PRODUCTORES ASESORES (Matr. 1574).
//  - Ubicación del riesgo = domicilio de envío de la compra.
// Suma asegurada NO se imprime (= costo sin IVA del equipo: mostrarla le
// revelaría el costo al cliente); el modelo sí la trae — decisión pendiente.
// Agregado nuestro sobre el modelo: el IMEI del equipo (la denuncia policial
// debe incluirlo) y la nota de vigencia atada a la financiación.

export const POLIZA_NRO = '2980394 2222'

export interface DatosConstancia {
  numero: number
  cliente: string | null
  dni: string | null
  domicilio: string | null
  cp: string | null
  localidad: string | null
  articulo: string
  imei: string
  inicioVig: string // YYYY-MM-DD
  finVig: string // YYYY-MM-DD
  /** Fecha de emisión ISO (YYYY-MM-DD); se muestra en largo es-AR. */
  emitida: string
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 48, fontSize: 9, fontFamily: 'Helvetica', color: '#111' },
  h1: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  refLinea: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  vigBox: { borderWidth: 1, borderColor: '#111', width: 230, marginTop: 2 },
  vigTitulo: { backgroundColor: '#e5e5e5', fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingVertical: 2, fontSize: 8 },
  vigRow: { flexDirection: 'row' },
  vigCelda: { flex: 1, borderTopWidth: 1, borderColor: '#111', padding: 3, fontSize: 8 },
  vigNota: { fontSize: 7, fontFamily: 'Helvetica-Oblique', marginTop: 2 },
  asegurado: { width: 230 },
  aseguradoNombre: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  seccion: { marginTop: 14 },
  seccionTitulo: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', borderBottomWidth: 1, borderColor: '#111', paddingBottom: 2, marginBottom: 4, width: 220 },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique', fontSize: 8, color: '#333' },
  chico: { fontSize: 8 },
  footer: { position: 'absolute', bottom: 22, left: 48, right: 48, fontSize: 6.5, color: '#555', borderTopWidth: 0.5, borderColor: '#999', paddingTop: 4 },
})

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** 'YYYY-MM-DD' → 'martes 27 de octubre de 2026' (sin Date local: UTC puro). */
export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dia = DIAS_LARGO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${dia} ${d} de ${MESES_LARGO[m - 1]} de ${y}`
}

export async function renderConstanciaSeguro(c: DatosConstancia): Promise<Buffer> {
  const doc = (
    <Document title={`Constancia de Cobertura — Certificado N° ${c.numero}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Robo</Text>
        <Text style={s.h2}>Constancia de Cobertura</Text>
        <View style={s.topRow}>
          <View>
            <Text style={s.refLinea}>Ref: {String(c.numero)}   Póliza Nro. {POLIZA_NRO}</Text>
            <View style={s.vigBox}>
              <Text style={s.vigTitulo}>VIGENCIA</Text>
              <View style={s.vigRow}>
                <Text style={s.vigCelda}>Desde las 12 hs {fechaCorta(c.inicioVig)}</Text>
                <Text style={[s.vigCelda, { borderLeftWidth: 1 }]}>Hasta las 12 hs {fechaCorta(c.finVig)}</Text>
              </View>
            </View>
            <Text style={s.vigNota}>Cobertura durante toda la vigencia de la financiación de la compra.</Text>
          </View>
          <View style={s.asegurado}>
            <Text style={s.chico}>Asegurado:</Text>
            <Text style={s.aseguradoNombre}>{(c.cliente ?? '—').toUpperCase()}</Text>
            {c.domicilio ? <Text>{c.domicilio}</Text> : null}
            <Text>{[c.cp, c.localidad].filter(Boolean).join('  ')}</Text>
            <Text style={{ marginTop: 3 }}>
              <Text style={s.bold}>Certificado N°: </Text>{String(c.numero)}
              <Text style={s.bold}>   DNI: </Text>{c.dni ?? '—'}
            </Text>
            <Text style={[s.italic, { marginTop: 4, textAlign: 'right' }]}>Emitida el día {fechaLarga(c.emitida)}</Text>
          </View>
        </View>
        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Ubicación del riesgo</Text>
          <Text>{c.domicilio ?? '—'}</Text>
          <Text style={s.bold}>{[c.cp, c.localidad].filter(Boolean).join(' ')}</Text>
        </View>
        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Descripción del riesgo asegurado</Text>
          <Text style={{ fontFamily: 'Helvetica-BoldOblique' }}>Robo Tecnología</Text>
          <Text>Objetos Diversos</Text>
        </View>
        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Coberturas</Text>
          <Text style={s.bold}>• Objetos Diversos</Text>
          <Text style={s.italic}>MODALIDAD DE LA COBERTURA: a primera pérdida absoluta</Text>
          <Text style={s.italic}>RIESGO CUBIERTO: Robo en el mundo entero.</Text>
        </View>
        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Bienes asegurados</Text>
          <Text style={s.bold}>• Celular</Text>
          <Text style={s.italic}>{c.articulo}</Text>
          <Text style={{ marginTop: 2 }}>
            <Text style={s.bold}>IMEI: </Text>{c.imei}
          </Text>
          <Text style={[s.chico, { color: '#333' }]}>Ante un robo, la denuncia policial debe incluir este IMEI.</Text>
        </View>
        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Anexos y cláusulas</Text>
          <Text style={s.chico}>• 100 (Condiciones Generales Comunes)</Text>
          <Text style={s.chico}>• 115 (Condiciones Especiales) — Conforme Cláusulas: Cobertura de Robo Objetos Diversos con valor especificado en el mundo (Incendio y Robo) (Nro. 75)</Text>
          <Text style={s.chico}>• 120 (Condiciones Particulares) — Conforme Cláusulas: Cláusula Año 2000 (Nro. 74) · Exclusión (Nro. 103) · Defensor del Asegurado (Nro. 105)</Text>
          <Text style={s.chico}>• 150 (Cobranza de Premios)</Text>
        </View>
        <View style={s.seccion}>
          <Text style={s.seccionTitulo}>Productor — Asesor</Text>
          <Text style={s.chico}>• ASEGURALO PRODUCTORES ASESORES DE SEGUROS (Matr. 1574) (Productor)</Text>
        </View>
        <Text style={s.footer}>
          IMPORTANTE: Para tu información, todas las Condiciones Generales y las Cláusulas Adicionales de la Póliza contratada se encuentran a tu disposición en www.sancorseguros.com. Sin perjuicio de ello, podrás solicitar o descargar un ejemplar desde el sitio de autogestión autogestion.sancorseguros.com.ar, por el WhatsApp +54 9 3493 510404, llamando al 0800 444 2850 o mediante tu Productor Asesor.
        </Text>
      </Page>
    </Document>
  )
  return renderToBuffer(doc)
}
