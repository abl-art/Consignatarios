'use server'

// Anular orden (reembolso TOTAL por la API Redirect de GOcuotas) desde las
// pestañas Rescates y Devoluciones: el botón VIAJA con la línea (decisión de
// Emiliano 28/10). La acción de reembolso en sí no cambia (misma API que
// Arrepentimientos).
//
// Desde el 19/11 el estado de Pedro NO habilita ni bloquea (decisión de
// Emiliano: solo Yami anula, y las devoluciones recargadas a mano en
// andreani.com nunca existen en Pedro — caso SO-NZYZPE). Se lo sigue
// consultando solo para etiquetar el contexto de la traza, sin bloquear si
// falla. Revisar cuando crezca el equipo. Protecciones vigentes: orden
// GOcuotas identificada y activa (approved/paid/collected), sesión válida, y
// la traza e idempotencia en refunds_api: la fila se inserta antes del refund
// (PK = candado contra doble disparo) y se borra si el refund falla, para
// permitir el reintento.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { reembolsarOrdenGocuotas, getOrdenGocuotas } from '@/lib/gocuotas-api'
import { getCancelacionEstado } from '@/lib/gocelular-webhook'
import { estadosDesdeGetCancelacion } from '@/lib/estados-andreani'

export async function anularOrdenCaso(input: {
  gocuotasOrderId: string
  gocuotasStatus: string | null
  orderNumber: string
}): Promise<{ ok?: true; statusNuevo?: string; error?: string }> {
  // Estado de Pedro: solo para etiquetar la traza (contexto rescate vs
  // devolución) — si el GET falla no bloquea (ver cabecera)
  const res = await getCancelacionEstado({ order_number: input.orderNumber }).catch(() => null)
  const { rescateEstado } = estadosDesdeGetCancelacion(res?.ok ? res.body : null)

  // Sin el piso de Pedro, el estado que autoriza no puede venir del browser:
  // se verifica fresco contra la API de GOcuotas que la orden exista y no esté
  // ya anulada (único bloqueo vigente además del candado)
  const ordenActual = await getOrdenGocuotas(input.gocuotasOrderId)
  if (!ordenActual) {
    return { error: 'No se pudo consultar la orden en GOcuotas — reintentá en un rato.' }
  }
  if (ordenActual.discarded_at) {
    return { error: 'La orden ya está anulada en GOcuotas.' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión vencida — volvé a iniciar sesión.' }

  // Candado: si ya hay una fila, alguien lo disparó antes (otra pestaña, otro usuario)
  const admin = createAdminClient()
  const { error: lockError } = await admin.from('refunds_api').insert({
    gocuotas_order_id: input.gocuotasOrderId,
    order_number: input.orderNumber,
    usuario: user.email ?? user.id,
    contexto: rescateEstado ? 'rescate' : 'devolucion',
    detalle: 'pendiente',
  })
  if (lockError) {
    return { error: lockError.code === '23505' ? 'Ya hay un reembolso disparado para esta orden.' : lockError.message }
  }

  const refund = await reembolsarOrdenGocuotas(input.gocuotasOrderId)
  if (!refund.ok) {
    // Liberar el candado: el refund no salió, se puede reintentar
    await admin.from('refunds_api').delete().eq('gocuotas_order_id', input.gocuotasOrderId)
    return { error: refund.error }
  }
  await admin.from('refunds_api').update({ detalle: refund.detalle }).eq('gocuotas_order_id', input.gocuotasOrderId)

  // Verificación post-refund contra la API (la réplica puede tardar en reflejarlo)
  const orden = await getOrdenGocuotas(input.gocuotasOrderId)
  const statusNuevo = orden?.discarded_at ? 'discarded' : (orden?.status ?? undefined)
  revalidatePath('/compras/envios')
  return { ok: true, statusNuevo }
}
