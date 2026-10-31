// Mail de bienvenida del seguro por robo (etapa 2b): se envía al cliente al
// emitirse su certificado (ya con IMEI asignado y número correlativo). El
// contenido gira alrededor de las TRES condiciones para que un reclamo se
// apruebe (regla de Emiliano 30/10/2026): cuotas al día, denuncia policial
// con el IMEI y baja del IMEI al *910 guardando el número de gestión. El N°
// de certificado va destacado con la instrucción de guardar el mail: el
// formulario de denuncia lo pide y no queremos que llamen a GOcelular a
// preguntarlo. Lógica pura: arma asunto/texto/html, no envía nada.

import { TOKEN_DENUNCIA } from '@/lib/seguros'

export const LINK_DENUNCIA = `https://goabl.app/denuncia-robo?token=${TOKEN_DENUNCIA}`

export type DatosMailCertificado = {
  numero: number
  articulo: string
  imei: string
  inicioVig: string // YYYY-MM-DD
  finVig: string // YYYY-MM-DD
}

export type MailArmado = { asunto: string; texto: string; html: string }

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (string puro, sin Date ni timezone). */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function armarMailCertificado(datos: DatosMailCertificado): MailArmado {
  const { numero, articulo, imei } = datos
  const desde = fechaCorta(datos.inicioVig)
  const hasta = fechaCorta(datos.finVig)

  // "Tu seguro contra robo" fijo en el asunto: es lo que le decimos al
  // cliente que busque en su casilla para encontrar el N° de certificado.
  const asunto = `Tu seguro contra robo ya está activo — Certificado N° ${numero}`

  const texto = `Tu seguro contra robo ya está activo

Tu ${articulo} comprado en GOcelular quedó cubierto contra robo, sin costo extra.

GUARDÁ ESTE MAIL: el N° de certificado te lo vamos a pedir para cualquier reclamo. Si lo necesitás, buscá "Tu seguro contra robo" en tu casilla.

Certificado: N° ${numero}
Equipo: ${articulo}
IMEI: ${imei}
Vigencia: ${desde} al ${hasta}

SI TE ROBAN EL EQUIPO, para que el seguro se apruebe necesitás estas 3 cosas:

1) CUOTAS AL DÍA — la cobertura se suspende mientras tengas cuotas vencidas. Antes de reclamar, poné tu plan al día.

2) DENUNCIA POLICIAL CON EL IMEI — hacela lo antes posible y asegurate de que incluya el IMEI ${imei} (lo tenés en este mail y en la caja del celular). Sin el IMEI en la denuncia, el reclamo no avanza.

3) BAJA DEL IMEI AL *910 — llamá gratis al *910 (todas las compañías, las 24 hs), pedí el bloqueo por robo y ANOTÁ EL NÚMERO DE GESTIÓN que te da la operadora: te lo vamos a pedir.

Con esas 3 cosas, cargá tu reclamo en:
${LINK_DENUNCIA}

Te van a pedir tu DNI, el N° de certificado (${numero}) y el número de gestión de la baja del IMEI.

La cobertura es por robo (no incluye extravío ni rotura) y dura 9 meses desde la compra. Si te roban el equipo se reemplaza el teléfono: no se entregan créditos ni vouchers.

GOcelular · Seguro por robo operado con Sancor Seguros a través de ASEGURALO Productores Asesores (Matr. 1574).
Este mail se envió porque tu compra incluye el seguro contra robo.`

  const html = `
<div style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto">
    <div style="background:#ffffff;border-radius:14px;border:1px solid #e4e4e7;overflow:hidden">
      <div style="background:#18181b;color:#ffffff;padding:20px 28px">
        <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a1a1aa">GOcelular</p>
        <h1 style="margin:4px 0 0;font-size:21px">🛡️ Tu seguro contra robo ya está activo</h1>
      </div>
      <div style="padding:24px 28px;font-size:15px;line-height:1.6">
        <p style="margin:0 0 12px">¡Hola!</p>
        <p style="margin:0 0 12px">Tu <b>${articulo}</b> comprado en GOcelular quedó cubierto contra <b>robo</b>, sin costo extra.</p>
        <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:10px 16px;margin:0 0 16px;font-size:13px;color:#3730a3">
          📌 <b>Guardá este mail.</b> El N° de certificado te lo vamos a pedir para cualquier reclamo — si lo necesitás, buscá <b>"Tu seguro contra robo"</b> en tu casilla.
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
          <tr><td style="padding:10px 14px;color:#71717a">Certificado</td><td style="padding:10px 14px;text-align:right;font-size:17px"><b>N° ${numero}</b></td></tr>
          <tr><td style="padding:8px 14px;color:#71717a;border-top:1px solid #e4e4e7">Equipo</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e4e4e7"><b>${articulo}</b></td></tr>
          <tr><td style="padding:8px 14px;color:#71717a;border-top:1px solid #e4e4e7">IMEI</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e4e4e7"><b style="font-family:monospace">${imei}</b></td></tr>
          <tr><td style="padding:8px 14px;color:#71717a;border-top:1px solid #e4e4e7">Vigencia</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e4e4e7"><b>${desde} al ${hasta}</b></td></tr>
        </table>

        <h2 style="font-size:16px;margin:0 0 4px">🚨 Si te roban el equipo</h2>
        <p style="margin:0 0 12px;font-size:14px;color:#52525b">Para que el seguro se apruebe necesitás <b>estas 3 cosas</b>:</p>

        <div style="border:1px solid #e4e4e7;border-radius:10px;padding:14px 16px;margin-bottom:10px">
          <p style="margin:0;font-size:14px"><b>1 · Cuotas al día</b></p>
          <p style="margin:4px 0 0;font-size:13px;color:#52525b">La cobertura se suspende mientras tengas cuotas vencidas. Antes de reclamar, poné tu plan al día.</p>
        </div>
        <div style="border:1px solid #e4e4e7;border-radius:10px;padding:14px 16px;margin-bottom:10px">
          <p style="margin:0;font-size:14px"><b>2 · Denuncia policial con el IMEI</b></p>
          <p style="margin:4px 0 0;font-size:13px;color:#52525b">Hacela lo antes posible y asegurate de que incluya el IMEI <b style="font-family:monospace">${imei}</b> (lo tenés en este mail y en la caja del celular). Sin el IMEI en la denuncia, el reclamo no avanza.</p>
        </div>
        <div style="border:1px solid #e4e4e7;border-radius:10px;padding:14px 16px;margin-bottom:16px">
          <p style="margin:0;font-size:14px"><b>3 · Baja del IMEI al <span style="font-family:monospace">*910</span></b></p>
          <p style="margin:4px 0 0;font-size:13px;color:#52525b">Llamá gratis al <b>*910</b> (todas las compañías, las 24 hs), pedí el bloqueo por robo y <b>anotá el número de gestión</b> que te da la operadora: te lo vamos a pedir.</p>
        </div>

        <p style="margin:0 0 6px;font-size:14px">Con esas 3 cosas, cargá tu reclamo acá:</p>
        <div style="text-align:center;margin:12px 0 8px">
          <a href="${LINK_DENUNCIA}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;font-size:15px">Denunciar un robo</a>
        </div>
        <p style="margin:0 0 16px;font-size:12px;color:#71717a;text-align:center">Te van a pedir tu DNI, el N° de certificado (<b>${numero}</b>) y el número de gestión de la baja del IMEI.</p>

        <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:12px 16px;font-size:13px;color:#52525b">
          <b>Para tener en cuenta</b><br>
          • La cobertura es por <b>robo</b> (no incluye extravío ni rotura) y dura <b>9 meses</b> desde la compra.<br>
          • Si te roban el equipo, <b>se reemplaza el teléfono robado</b>: no se entregan créditos ni vouchers, ni se puede cambiar por otro equipo.
        </div>
      </div>
      <div style="padding:14px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa">
        GOcelular · Seguro por robo operado con Sancor Seguros a través de ASEGURALO Productores Asesores (Matr. 1574).<br>
        Este mail se envió porque tu compra incluye el seguro contra robo.
      </div>
    </div>
  </div>
</div>`

  return { asunto, texto, html }
}
