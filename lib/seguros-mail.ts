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

  // Identidad GOcelular (misma paleta que la app): magenta #E91E7B (magenta-600
  // de tailwind.config.ts) como color primario sobre tarjetas blancas, logo
  // real de goabl.app (público, el middleware deja pasar .png).
  const html = `
<div style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto">
    <div style="background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden">
      <div style="padding:20px 28px 16px;border-bottom:3px solid #E91E7B">
        <img src="https://goabl.app/logo.png" alt="GOcelular" height="32" style="height:32px;display:block;margin-bottom:10px">
        <h1 style="margin:0;font-size:21px;color:#111827">🛡️ Tu seguro contra robo ya está activo</h1>
      </div>
      <div style="padding:24px 28px;font-size:15px;line-height:1.6">
        <p style="margin:0 0 12px">¡Hola!</p>
        <p style="margin:0 0 12px">Tu <b>${articulo}</b> comprado en GOcelular quedó cubierto contra <b>robo</b>, sin costo extra.</p>
        <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:10px;padding:10px 16px;margin:0 0 16px;font-size:13px;color:#9d174d">
          📌 <b>Guardá este mail.</b> El N° de certificado te lo vamos a pedir para cualquier reclamo — si lo necesitás, buscá <b>"Tu seguro contra robo"</b> en tu casilla.
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px">
          <tr><td style="padding:10px 14px;color:#6b7280">Certificado</td><td style="padding:10px 14px;text-align:right;font-size:17px;color:#E91E7B"><b>N° ${numero}</b></td></tr>
          <tr><td style="padding:8px 14px;color:#6b7280;border-top:1px solid #e5e7eb">Equipo</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e5e7eb"><b>${articulo}</b></td></tr>
          <tr><td style="padding:8px 14px;color:#6b7280;border-top:1px solid #e5e7eb">IMEI</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e5e7eb"><b style="font-family:monospace">${imei}</b></td></tr>
          <tr><td style="padding:8px 14px;color:#6b7280;border-top:1px solid #e5e7eb">Vigencia</td><td style="padding:8px 14px;text-align:right;border-top:1px solid #e5e7eb"><b>${desde} al ${hasta}</b></td></tr>
        </table>

        <h2 style="font-size:16px;margin:0 0 4px;color:#111827">🚨 Si te roban el equipo</h2>
        <p style="margin:0 0 12px;font-size:14px;color:#4b5563">Para que el seguro se apruebe necesitás <b>estas 3 cosas</b>:</p>

        <div style="border:1px solid #e5e7eb;border-left:3px solid #E91E7B;border-radius:10px;padding:14px 16px;margin-bottom:10px">
          <p style="margin:0;font-size:14px"><b style="color:#E91E7B">1</b> · <b>Cuotas al día</b></p>
          <p style="margin:4px 0 0;font-size:13px;color:#4b5563">La cobertura se suspende mientras tengas cuotas vencidas. Antes de reclamar, poné tu plan al día.</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-left:3px solid #E91E7B;border-radius:10px;padding:14px 16px;margin-bottom:10px">
          <p style="margin:0;font-size:14px"><b style="color:#E91E7B">2</b> · <b>Denuncia policial con el IMEI</b></p>
          <p style="margin:4px 0 0;font-size:13px;color:#4b5563">Hacela lo antes posible y asegurate de que incluya el IMEI <b style="font-family:monospace">${imei}</b> (lo tenés en este mail y en la caja del celular). Sin el IMEI en la denuncia, el reclamo no avanza.</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-left:3px solid #E91E7B;border-radius:10px;padding:14px 16px;margin-bottom:16px">
          <p style="margin:0;font-size:14px"><b style="color:#E91E7B">3</b> · <b>Baja del IMEI al <span style="font-family:monospace">*910</span></b></p>
          <p style="margin:4px 0 0;font-size:13px;color:#4b5563">Llamá gratis al <b>*910</b> (todas las compañías, las 24 hs), pedí el bloqueo por robo y <b>anotá el número de gestión</b> que te da la operadora: te lo vamos a pedir.</p>
        </div>

        <p style="margin:0 0 6px;font-size:14px">Con esas 3 cosas, cargá tu reclamo acá:</p>
        <div style="text-align:center;margin:12px 0 8px">
          <a href="${LINK_DENUNCIA}" style="display:inline-block;background:#E91E7B;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;font-size:15px">Denunciar un robo</a>
        </div>
        <p style="margin:0 0 16px;font-size:12px;color:#6b7280;text-align:center">Te van a pedir tu DNI, el N° de certificado (<b>${numero}</b>) y el número de gestión de la baja del IMEI.</p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;font-size:13px;color:#4b5563">
          <b>Para tener en cuenta</b><br>
          • La cobertura es por <b>robo</b> (no incluye extravío ni rotura) y dura <b>9 meses</b> desde la compra.<br>
          • Si te roban el equipo, <b>se reemplaza el teléfono robado</b>: no se entregan créditos ni vouchers, ni se puede cambiar por otro equipo.
        </div>
      </div>
      <div style="padding:14px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">
        GOcelular · Seguro por robo operado con Sancor Seguros a través de ASEGURALO Productores Asesores (Matr. 1574).<br>
        Este mail se envió porque tu compra incluye el seguro contra robo.
      </div>
    </div>
  </div>
</div>`

  return { asunto, texto, html }
}
