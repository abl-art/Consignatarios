// Mail "como usuario" (etapa 2b, prototipo): constancia adjunta + cómo
// proceder ante robo. Se envía a Emiliano para que lo vea como cliente.
import fs from 'node:fs'
import { createRequire } from 'node:module'
const req = createRequire('/home/cremi/consignacion-seguros/package.json')
const nodemailer = req('nodemailer')

const env = Object.fromEntries(
  fs.readFileSync('/tmp/claude-1000/-home-cremi/6e3af34a-2830-4ef7-8e2b-e79c35a39623/scratchpad/env-sane', 'utf8')
    .split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const user = env.MAIL_ARREPENTIMIENTOS_USER
const pass = env.MAIL_ARREPENTIMIENTOS_PASS
if (!user || !pass) { console.error('faltan creds de mail'); process.exit(1) }

const LINK = 'https://goabl.app/denuncia-robo?token=denuncia2026go'
const IMEI = '350000000000001'

const html = `
<div style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto">
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:10px 16px;margin-bottom:16px;font-size:13px;color:#92400e">
      ⚠️ <b>MAIL DE PRUEBA</b> — así lo recibiría el cliente al emitirse su certificado. Sin validez.
    </div>
    <div style="background:#ffffff;border-radius:14px;border:1px solid #e4e4e7;overflow:hidden">
      <div style="background:#18181b;color:#ffffff;padding:20px 28px">
        <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a1a1aa">GOcelular</p>
        <h1 style="margin:4px 0 0;font-size:21px">🛡️ Tu seguro contra robo ya está activo</h1>
      </div>
      <div style="padding:24px 28px;font-size:15px;line-height:1.6">
        <p style="margin:0 0 12px">¡Hola!</p>
        <p style="margin:0 0 12px">Tu <b>Motorola Moto G17 4/256GB</b> comprado en GOcelular quedó cubierto contra <b>robo en todo el mundo</b>. Te adjuntamos la <b>constancia de cobertura</b> — guardala, es tu comprobante.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
          <tr><td style="padding:8px 14px;color:#71717a">Certificado</td><td style="padding:8px 14px;text-align:right"><b>N° 1</b></td></tr>
          <tr><td style="padding:8px 14px;color:#71717a;border-top:1px solid #e4e4e7">Equipo</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e4e4e7"><b>Moto G17 4/256GB</b></td></tr>
          <tr><td style="padding:8px 14px;color:#71717a;border-top:1px solid #e4e4e7">IMEI</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e4e4e7"><b style="font-family:monospace">${IMEI}</b></td></tr>
          <tr><td style="padding:8px 14px;color:#71717a;border-top:1px solid #e4e4e7">Vigencia</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e4e4e7"><b>29/10/2026 al 29/07/2027</b></td></tr>
        </table>
        <h2 style="font-size:16px;margin:20px 0 8px">🚨 ¿Qué hacer si te lo roban?</h2>
        <ol style="margin:0 0 16px;padding-left:20px">
          <li style="margin-bottom:10px"><b>Hacé la denuncia policial</b> lo antes posible, y <b>asegurate de que incluya el IMEI</b> del equipo: <b style="font-family:monospace">${IMEI}</b> (lo tenés en este mail, en la constancia adjunta y en la caja del celular). Sin el IMEI en la denuncia, el reclamo no avanza.</li>
          <li style="margin-bottom:10px"><b>Cargá tu denuncia</b> en nuestro formulario: ingresá tu DNI y subí una foto o PDF de la denuncia policial.</li>
          <li><b>Listo.</b> Nuestro equipo revisa el caso y te contacta para continuar el reclamo.</li>
        </ol>
        <div style="text-align:center;margin:20px 0">
          <a href="${LINK}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;font-size:15px">Denunciar un robo</a>
        </div>
        <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:12px 16px;font-size:13px;color:#52525b">
          <b>Para tener en cuenta</b><br>
          • Si te roban el equipo, <b>se reemplaza el teléfono robado</b>. No se entregan créditos ni vouchers, ni se puede cambiar por otro equipo.<br>
          • La cobertura es por <b>robo</b> (no incluye extravío ni rotura).<br>
          • Mantené tus cuotas al día: la cobertura se suspende mientras haya cuotas vencidas.<br>
          • La vigencia es de 9 meses desde la compra.
        </div>
      </div>
      <div style="padding:14px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa">
        GOcelular · Seguro por robo operado con Sancor Seguros a través de ASEGURALO Productores Asesores (Matr. 1574).<br>
        Este mail se envió porque tu compra incluye el seguro contra robo.
      </div>
    </div>
  </div>
</div>`

const texto = `[MAIL DE PRUEBA — sin validez]

Tu seguro contra robo ya está activo

Tu Motorola Moto G17 4/256GB comprado en GOcelular quedó cubierto contra robo en todo el mundo. Adjuntamos la constancia de cobertura (guardala, es tu comprobante).

Certificado: N° 1
IMEI: ${IMEI}
Vigencia: 29/10/2026 al 29/07/2027

¿Qué hacer si te lo roban?
1) Hacé la denuncia policial lo antes posible e incluí el IMEI ${IMEI} (sin el IMEI en la denuncia, el reclamo no avanza).
2) Cargá tu denuncia en ${LINK} — ingresá tu DNI y subí foto/PDF de la denuncia policial.
3) Nuestro equipo revisa el caso y te contacta.

Para tener en cuenta: si te roban el equipo, se reemplaza el teléfono robado — no se entregan créditos ni vouchers, ni se puede cambiar por otro equipo; la cobertura es por robo (no extravío ni rotura); mantené tus cuotas al día (la cobertura se suspende con cuotas vencidas); vigencia 9 meses desde la compra.

GOcelular · Seguro por robo operado con Sancor Seguros a través de ASEGURALO Productores Asesores (Matr. 1574).`

const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
const info = await transporte.sendMail({
  from: `GOcelular <${user}>`,
  to: 'emiliano.canova@gocuotas.com',
  subject: '🛡️ [PRUEBA] Tu seguro contra robo ya está activo — Certificado N° 1',
  text: texto,
  html,
  attachments: [{
    filename: 'Constancia de Cobertura - Certificado 1 (PRUEBA).pdf',
    path: '/tmp/claude-1000/-home-cremi/6e3af34a-2830-4ef7-8e2b-e79c35a39623/scratchpad/constancia-cert-1-PRUEBA.pdf',
  }],
})
console.log('enviado:', info.messageId, '→', info.accepted)
