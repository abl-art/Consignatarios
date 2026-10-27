// Envío de mails desde gocelulares@gocuotas.com (la misma casilla que lee el
// cron de arrepentimientos; el app password de Google sirve para SMTP también).
import nodemailer from 'nodemailer'

export async function enviarMail(opts: { para: string; asunto: string; texto: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = process.env.MAIL_ARREPENTIMIENTOS_USER
  const pass = process.env.MAIL_ARREPENTIMIENTOS_PASS
  if (!user || !pass) return { ok: false, error: 'Credenciales de mail no configuradas' }
  try {
    const transporte = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    })
    await transporte.sendMail({ from: `GOcelular360 <${user}>`, to: opts.para, subject: opts.asunto, text: opts.texto })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de SMTP' }
  }
}
