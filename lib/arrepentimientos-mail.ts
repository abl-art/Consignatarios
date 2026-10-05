// Lectura SOLO-LECTURA del buzón del Botón de Arrepentimiento. Nunca marca,
// mueve ni borra mails. El cursor por UID lo maneja el cron
// (app/api/cron/arrepentimientos).
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { esMailDelBoton, parsearAsuntoArrepentimiento } from '@/lib/arrepentimientos'

export interface MailBoton {
  uid: number
  fecha: string // ISO del Date del mail
  nombre: string
  dni: string
}

function nuevoCliente(): ImapFlow {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.MAIL_ARREPENTIMIENTOS_USER ?? '',
      pass: process.env.MAIL_ARREPENTIMIENTOS_PASS ?? '',
    },
    logger: false,
  })
}

export async function leerMailsNuevos(desdeUid: number): Promise<{
  mails: MailBoton[]
  maxUid: number
  uidValidity: number
  descartadosFiltro: number
  errores: number
}> {
  const client = nuevoCliente()
  await client.connect()
  const lock = await client.getMailboxLock('INBOX', { readOnly: true })
  try {
    const mb = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null
    const uidValidity = mb ? Number(mb.uidValidity) : 0
    let maxUid = desdeUid
    const mails: MailBoton[] = []
    let descartadosFiltro = 0
    let errores = 0

    // SUBJECT de IMAP es substring case-insensitive; el filtro fino (las tres
    // firmas) corre después sobre el mail parseado.
    const uids = await client.search(
      { header: { subject: 'Arrepentimiento' }, uid: `${desdeUid + 1}:*` },
      { uid: true }
    )
    // Gmail devuelve el último UID del buzón aunque sea < desdeUid+1: filtrar.
    const nuevos = (uids || []).filter(u => u > desdeUid).sort((a, b) => a - b)

    for (const uid of nuevos) {
      maxUid = Math.max(maxUid, uid)
      // Un mail "veneno" (download/parse que revienta) no frena la cola:
      // se loguea con su UID, se cuenta y se sigue (fix del review final)
      try {
        const dl = await client.download(String(uid), undefined, { uid: true })
        if (!dl?.content) {
          descartadosFiltro++
          continue
        }
        const parsed = await simpleParser(dl.content)
        const from = parsed.from?.value?.[0]?.address ?? null
        const asunto = parsed.subject ?? null
        const texto = parsed.text ?? null
        if (!esMailDelBoton({ from, asunto, texto })) {
          descartadosFiltro++
          continue
        }
        const datos = parsearAsuntoArrepentimiento(asunto)!
        mails.push({
          uid,
          fecha: (parsed.date ?? new Date()).toISOString(),
          nombre: datos.nombre,
          dni: datos.dni,
        })
      } catch (e) {
        console.error(`arrepentimientos: error procesando mail UID ${uid}:`, e)
        errores++
      }
    }
    return { mails, maxUid, uidValidity, descartadosFiltro, errores }
  } finally {
    lock.release()
    await client.logout()
  }
}

/** UID más alto del buzón + uidValidity, para sembrar el cursor sin backfill. */
export async function leerEstadoBuzon(): Promise<{ maxUid: number; uidValidity: number }> {
  const client = nuevoCliente()
  await client.connect()
  const lock = await client.getMailboxLock('INBOX', { readOnly: true })
  try {
    const mb = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox : null
    return {
      maxUid: mb ? Number(mb.uidNext) - 1 : 0,
      uidValidity: mb ? Number(mb.uidValidity) : 0,
    }
  } finally {
    lock.release()
    await client.logout()
  }
}
