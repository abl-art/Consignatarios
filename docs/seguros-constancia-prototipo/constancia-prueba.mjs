// Constancia de Cobertura de PRUEBA (formato modelo Sancor + IMEI) para el
// certificado N°1 de prueba, + mail "como usuario" a Emiliano con el PDF y
// las instrucciones ante robo. Prototipo de la etapa 2b (bloqueada por
// respuestas del broker) — campos pendientes marcados "a confirmar".
import { createRequire } from 'node:module'
import fs from 'node:fs'
const req = createRequire('/home/cremi/consignacion-seguros/package.json')
const React = req('react')
const { Document, Page, Text, View, StyleSheet, renderToBuffer } = req('@react-pdf/renderer')
const nodemailer = req('nodemailer')

const e = React.createElement

const CERT = {
  numero: 1,
  cliente: 'PRUEBA Punta a Punta',
  dni: '99888777',
  domicilio: 'Av. Siempreviva 742',
  cp: '5000',
  localidad: 'Córdoba (Córdoba)',
  articulo: 'MOTOROLA MOTO G17 4/256GB (PRUEBA)',
  imei: '350000000000001',
  desde: '29/10/2026',
  hasta: '29/07/2027',
  emitida: 'miércoles 29 de octubre de 2026',
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 48, fontSize: 9, fontFamily: 'Helvetica', color: '#111' },
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
  filaSuma: { flexDirection: 'row', justifyContent: 'space-between' },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique', fontSize: 8, color: '#333' },
  chico: { fontSize: 8 },
  pendiente: { color: '#b45309', fontFamily: 'Helvetica-Oblique' },
  marcaAgua: { position: 'absolute', top: 330, left: 60, fontSize: 48, color: '#f87171', opacity: 0.28, transform: 'rotate(-30deg)', fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 22, left: 48, right: 48, fontSize: 6.5, color: '#555', borderTopWidth: 0.5, borderColor: '#999', paddingTop: 4 },
})

const doc = e(Document, { title: `Constancia de Cobertura — Certificado N° ${CERT.numero} (PRUEBA)` },
  e(Page, { size: 'A4', style: s.page },
    e(Text, { style: s.marcaAgua }, 'PRUEBA — SIN VALIDEZ'),
    e(Text, { style: s.h1 }, 'Robo'),
    e(Text, { style: s.h2 }, 'Constancia de Cobertura'),
    e(View, { style: s.topRow },
      e(View, null,
        e(Text, { style: s.refLinea }, `Ref: ${CERT.numero}   Póliza Nro. `, e(Text, { style: s.pendiente }, 'A CONFIRMAR (broker)')),
        e(View, { style: s.vigBox },
          e(Text, { style: s.vigTitulo }, 'VIGENCIA'),
          e(View, { style: s.vigRow },
            e(Text, { style: s.vigCelda }, `Desde las 12 hs ${CERT.desde}`),
            e(Text, { style: [s.vigCelda, { borderLeftWidth: 1 }] }, `Hasta las 12 hs ${CERT.hasta}`),
          ),
        ),
        e(Text, { style: s.vigNota }, 'Vigencia: 9 meses desde la compra.'),
      ),
      e(View, { style: s.asegurado },
        e(Text, { style: s.chico }, 'Asegurado:'),
        e(Text, { style: s.aseguradoNombre }, CERT.cliente.toUpperCase()),
        e(Text, null, CERT.domicilio),
        e(Text, null, `${CERT.cp}  ${CERT.localidad}`),
        e(Text, { style: { marginTop: 3 } }, e(Text, { style: s.bold }, 'Certificado N°: '), String(CERT.numero), e(Text, { style: s.bold }, '   DNI: '), CERT.dni),
        e(Text, { style: [s.italic, { marginTop: 4, textAlign: 'right' }] }, `Emitida el día ${CERT.emitida}`),
      ),
    ),
    e(View, { style: s.seccion },
      e(Text, { style: s.seccionTitulo }, 'Ubicación del riesgo'),
      e(Text, null, CERT.domicilio),
      e(Text, { style: s.bold }, `${CERT.cp} ${CERT.localidad}`),
      e(Text, { style: [s.pendiente, s.chico] }, '(domicilio de envío de la compra — a confirmar con el broker)'),
    ),
    e(View, { style: s.seccion },
      e(Text, { style: s.seccionTitulo }, 'Descripción del riesgo asegurado'),
      e(Text, { style: [s.bold, { fontFamily: 'Helvetica-BoldOblique' }] }, 'Robo Tecnología'),
      e(Text, null, 'Objetos Diversos'),
    ),
    e(View, { style: s.seccion },
      e(Text, { style: s.seccionTitulo }, 'Coberturas'),
      e(Text, { style: s.bold }, '• Objetos Diversos'),
      e(Text, { style: s.italic }, 'MODALIDAD DE LA COBERTURA: a primera pérdida absoluta'),
      e(Text, { style: s.italic }, 'RIESGO CUBIERTO: Robo en el mundo entero.'),
    ),
    e(View, { style: s.seccion },
      e(Text, { style: s.seccionTitulo }, 'Bienes asegurados'),
      e(Text, { style: s.bold }, '• Celular'),
      e(Text, { style: s.italic }, CERT.articulo),
      e(Text, { style: { marginTop: 2 } }, e(Text, { style: s.bold }, 'IMEI: '), CERT.imei),
      e(Text, { style: [s.chico, { color: '#333' }] }, 'Ante un robo, la denuncia policial debe incluir este IMEI.'),
    ),
    e(View, { style: s.seccion },
      e(Text, { style: s.seccionTitulo }, 'Anexos y cláusulas'),
      e(Text, { style: s.chico }, '• 100 (Condiciones Generales Comunes)'),
      e(Text, { style: s.chico }, '• 115 (Condiciones Especiales) — Cobertura de Robo Objetos Diversos con valor especificado en el mundo (Incendio y Robo) (Nro. 75)'),
      e(Text, { style: s.chico }, '• 120 (Condiciones Particulares) — Exclusión (Nro. 103) · Defensor del Asegurado (Nro. 105)'),
      e(Text, { style: s.chico }, '• 150 (Cobranza de Premios)'),
    ),
    e(View, { style: s.seccion },
      e(Text, { style: s.seccionTitulo }, 'Productor — Asesor'),
      e(Text, { style: s.chico }, '• ASEGURALO PRODUCTORES ASESORES DE SEGUROS (Matr. 1574) (Productor)'),
    ),
    e(Text, { style: s.footer },
      'DOCUMENTO DE PRUEBA generado por GOcelular360 para validar el flujo — no constituye cobertura. Formato según modelo de constancia Sancor Seguros; póliza colectiva, campo Ref y ubicación del riesgo pendientes de confirmación del broker. Condiciones generales en www.sancorseguros.com · WhatsApp +54 9 3493 510404 · 0800 444 2850.',
    ),
  ),
)

const pdf = await renderToBuffer(doc)
const out = '/tmp/claude-1000/-home-cremi/6e3af34a-2830-4ef7-8e2b-e79c35a39623/scratchpad/constancia-cert-1-PRUEBA.pdf'
fs.writeFileSync(out, pdf)
console.log('PDF OK:', out, pdf.length, 'bytes')
