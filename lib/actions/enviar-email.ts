'use server'

import { getGoogleAccessToken } from '@/lib/google'

interface ItemPedidoEmail {
  codigo: string
  nombre: string
  cantidad: number
}

// Envia la nota de pedido por Gmail al proveedor, SIN precios.
// Usa la conexion Google del admin (misma que el calendario, scope gmail.send).
export async function enviarPedidoEmail(input: {
  proveedorEmail: string
  proveedorNombre: string
  fecha: string
  items: ItemPedidoEmail[]
}): Promise<{ ok?: boolean; error?: string }> {
  const { proveedorEmail, proveedorNombre, fecha, items } = input

  if (!proveedorEmail || !proveedorEmail.includes('@')) {
    return { error: 'El proveedor no tiene un email cargado. Agregalo en Compras > Proveedores.' }
  }
  if (items.length === 0) return { error: 'La nota no tiene items.' }

  const accessToken = await getGoogleAccessToken()
  if (!accessToken) {
    return { error: 'Google no está conectado. Conectá tu cuenta desde la página de Notas.' }
  }

  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0)

  const filas = items
    .map(
      i => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;color:#666">${i.codigo || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${i.nombre}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${i.cantidad}</td>
      </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px;margin:0 auto">
  <h2 style="margin-bottom:4px">Nota de Pedido — GOcelular</h2>
  <p style="margin:0;color:#555;font-size:14px">Fecha: ${fecha}</p>
  <p style="margin:0 0 16px;color:#555;font-size:14px">Proveedor: ${proveedorNombre}</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;font-size:12px;color:#555">CÓDIGO</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;font-size:12px;color:#555">PRODUCTO</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd;font-size:12px;color:#555">CANTIDAD</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="padding:10px 12px;font-weight:700">Total unidades</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700">${totalUnidades}</td>
      </tr>
    </tfoot>
  </table>
  <p style="margin-top:20px;color:#888;font-size:12px">Por favor confirmar recepción de este pedido respondiendo este correo.</p>
</body>
</html>`

  const subject = `Nota de Pedido - GOcelular - ${fecha}`
  const mime = [
    `To: ${proveedorEmail}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64'),
  ].join('\r\n')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }),
  })

  if (!res.ok) {
    const detail = await res.text()
    if (res.status === 403 || res.status === 401) {
      return {
        error:
          'Gmail no está autorizado todavía. Reconectá tu cuenta de Google desde la página de Notas (botón Conectar Google) para dar el permiso de envío.',
      }
    }
    return { error: `Gmail respondió ${res.status}: ${detail.slice(0, 200)}` }
  }

  return { ok: true }
}
