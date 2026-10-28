'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  fetchVentasAsegurables,
  fetchImeiActualPorOrden,
  fetchOrdenesDescartadas,
  fetchContracargosConFecha,
  fetchCostoPorImei,
  fetchCuotasMora,
} from '@/lib/gocelular'
import { getProductosCelularesConPrecio } from '@/lib/actions/lista-precios'
import { normalizarModelo } from '@/lib/inventario-indicadores'
import { prepararCertificados, novedadesDeCertificados, fechaRoboEnRango, type CertActual } from '@/lib/seguros'

// Seguros por Robo: config del switch global + parámetros de prima/ingreso,
// sincronización de emisión (nuevas ventas + reintento de pendientes +
// novedades de ciclo de vida) y lectura de certificados para la UI/export.

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SegurosConfig {
  activo: boolean
  activadoAt: string | null
  parametros: { tipo: 'prima' | 'ingreso'; porcentaje: number; vigenteDesde: string }[]
}

export async function getSegurosConfig(): Promise<SegurosConfig> {
  const supabase = createAdminClient()
  const [
    { data: config, error: errorConfig },
    { data: parametros, error: errorParametros },
  ] = await Promise.all([
    supabase.from('seguros_config').select('activo, activado_at').eq('id', 1).single(),
    supabase
      .from('seguros_parametros')
      .select('tipo, porcentaje, vigente_desde')
      .order('vigente_desde', { ascending: true }),
  ])
  if (errorConfig) throw new Error(errorConfig.message)
  if (errorParametros) throw new Error(errorParametros.message)

  return {
    activo: config?.activo ?? false,
    activadoAt: config?.activado_at ?? null,
    parametros: (parametros ?? []).map((p) => ({
      tipo: p.tipo as 'prima' | 'ingreso',
      porcentaje: Number(p.porcentaje),
      vigenteDesde: p.vigente_desde as string,
    })),
  }
}

/**
 * Activo ⇒ entran todas las ventas vinculadas desde ese momento. Cada
 * transición inactivo→activo pisa `activado_at` con `now()` (una nueva
 * ventana de cobertura); desactivar, o re-activar sin haber pasado por
 * inactivo, no toca la fecha.
 */
export async function setSeguroActivo(activo: boolean): Promise<void> {
  const supabase = createAdminClient()
  const { data: actual, error: errorActual } = await supabase.from('seguros_config').select('activo').eq('id', 1).single()
  if (errorActual) throw new Error(errorActual.message)
  const transicionAActivo = activo && !(actual?.activo ?? false)

  const update: { activo: boolean; activado_at?: string } = { activo }
  if (transicionAActivo) update.activado_at = new Date().toISOString()

  const { error } = await supabase.from('seguros_config').update(update).eq('id', 1)
  if (error) throw new Error(error.message)

  revalidatePath('/seguros')
}

export async function setParametro(
  tipo: 'prima' | 'ingreso',
  porcentaje: number,
  vigenteDesde: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('seguros_parametros')
    .upsert({ tipo, porcentaje, vigente_desde: vigenteDesde }, { onConflict: 'tipo,vigente_desde' })
  if (error) throw new Error(error.message)

  revalidatePath('/seguros')
}

// ---------------------------------------------------------------------------
// Sincronización de emisión
// ---------------------------------------------------------------------------

/** Certificados por llamada a seguros_emitir — evita payloads jsonb enormes en una sola corrida. */
const LOTE_EMITIR = 500

function enLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano))
  return lotes
}

export async function sincronizarSeguros(): Promise<{ emitidos: number; novedades: number }> {
  const supabase = createAdminClient()
  const { data: config, error: errorConfig } = await supabase
    .from('seguros_config')
    .select('activo, activado_at')
    .eq('id', 1)
    .single()
  if (errorConfig) throw new Error(errorConfig.message)

  if (!config?.activo || !config.activado_at) return { emitidos: 0, novedades: 0 }

  let emitidos = 0

  // 1) Ventas nuevas desde la activación → certificados nuevos (emitidos o pendientes).
  const ventas = await fetchVentasAsegurables(config.activado_at)

  const { data: existentesRows, error: errorExistentes } = await supabase
    .from('seguros_certificados')
    .select('gocuotas_order_id')
  if (errorExistentes) throw new Error(errorExistentes.message)
  const ordenesExistentes = new Set((existentesRows ?? []).map((r) => r.gocuotas_order_id as string))

  const productos = await getProductosCelularesConPrecio()
  const costosPorClave = new Map<string, number>()
  for (const p of productos) costosPorClave.set(normalizarModelo(p.nombre), p.mejor_precio)

  const imeisNuevos = [
    ...new Set(
      ventas
        .filter((v) => !ordenesExistentes.has(v.gocuotasOrderId) && costosPorClave.get(normalizarModelo(v.articulo)) === undefined)
        .map((v) => v.imei),
    ),
  ]
  const costoPorImei = await fetchCostoPorImei(imeisNuevos)

  const nuevos = prepararCertificados(ventas, ordenesExistentes, costosPorClave, costoPorImei, config.activado_at)

  if (nuevos.length > 0) {
    const payload = nuevos.map((c) => ({
      gocuotas_order_id: c.gocuotasOrderId,
      store_order_id: c.storeOrderId,
      pedido_numero: c.pedidoNumero,
      dni: c.dni,
      cliente: c.cliente,
      domicilio: c.domicilio,
      cp: c.cp,
      localidad: c.localidad,
      articulo: c.articulo,
      imei: c.imei,
      costo_sin_iva: c.costoSinIva,
      suma_asegurada: c.sumaAsegurada,
      costo_fuente: c.costoFuente,
      inicio_vig: c.inicioVig,
      fin_vig: c.finVig,
    }))
    for (const lote of enLotes(payload, LOTE_EMITIR)) {
      const { data: insertados, error } = await supabase.rpc('seguros_emitir', { certs: lote })
      if (error) throw new Error(error.message)
      emitidos += insertados ?? 0
    }
  }

  // 2) Certificados pendientes: reintentar costo (lista o imei) y emitir.
  const { data: pendientesRows, error: errorPendientes } = await supabase
    .from('seguros_certificados')
    .select('id, articulo, imei')
    .eq('estado', 'pendiente')
  if (errorPendientes) throw new Error(errorPendientes.message)

  const pendientes = pendientesRows ?? []
  if (pendientes.length > 0) {
    const imeisPendientes = [
      ...new Set(pendientes.filter((p) => costosPorClave.get(normalizarModelo(p.articulo as string)) === undefined).map((p) => p.imei as string)),
    ]
    const costoPorImeiPendientes = await fetchCostoPorImei(imeisPendientes)

    for (const p of pendientes) {
      const porClave = costosPorClave.get(normalizarModelo(p.articulo as string))
      const costo = porClave !== undefined ? porClave : costoPorImeiPendientes.get(p.imei as string)
      if (costo === undefined) continue

      const fuente: 'lista' | 'inventario' = porClave !== undefined ? 'lista' : 'inventario'
      // Misma regla que prepararCertificados (lib/seguros.ts): suma asegurada =
      // costo sin IVA + 10%, redondeado a 2 decimales. Esa constante no está
      // exportada (es interna de lib/seguros.ts, fuera del scope de Task 4),
      // así que se repite el cálculo acá para las recuperaciones de pendientes.
      const suma = Math.round((costo * 1.1 + Number.EPSILON) * 100) / 100
      const { data: emitido, error } = await supabase.rpc('seguros_emitir_pendiente', {
        cert_id: p.id,
        costo,
        suma,
        fuente,
      })
      if (error) throw new Error(error.message)
      if (emitido) emitidos += 1
    }
  }

  // 3) Novedades de ciclo de vida: cambio de IMEI, anulación por descarte o contracargo.
  const { data: certsActualesRows, error: errorCertsActuales } = await supabase
    .from('seguros_certificados')
    .select('id, gocuotas_order_id, imei, fecha_anula, fecha_siniestro')
  if (errorCertsActuales) throw new Error(errorCertsActuales.message)

  const certsActuales: CertActual[] = (certsActualesRows ?? []).map((c) => ({
    id: c.id as string,
    gocuotasOrderId: c.gocuotas_order_id as string,
    imei: c.imei as string,
    fechaAnula: c.fecha_anula as string | null,
    fechaSiniestro: c.fecha_siniestro as string | null,
  }))

  const ordenIds = certsActuales.map((c) => c.gocuotasOrderId)
  const [imeiActualPorOrden, discardedPorOrden, contracargoPorOrden] = await Promise.all([
    fetchImeiActualPorOrden(ordenIds),
    fetchOrdenesDescartadas(ordenIds),
    fetchContracargosConFecha(),
  ])

  const novedades = novedadesDeCertificados(certsActuales, imeiActualPorOrden, discardedPorOrden, contracargoPorOrden)

  for (const n of novedades) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (n.imei !== undefined) update.imei = n.imei
    if (n.fechaAnula !== undefined) update.fecha_anula = n.fechaAnula
    if (n.motivoAnula !== undefined) update.motivo_anula = n.motivoAnula

    const { error } = await supabase.from('seguros_certificados').update(update).eq('id', n.id)
    if (error) throw new Error(error.message)
  }

  if (emitidos > 0 || novedades.length > 0) {
    revalidatePath('/seguros')
  }

  return { emitidos, novedades: novedades.length }
}

// ---------------------------------------------------------------------------
// Lectura para UI / export
// ---------------------------------------------------------------------------

export type CertificadoRow = {
  id: string
  numero: number | null
  gocuotasOrderId: string
  storeOrderId: string | null
  pedidoNumero: string | null
  dni: string | null
  cliente: string | null
  domicilio: string | null
  cp: string | null
  localidad: string | null
  articulo: string
  imei: string
  costoSinIva: number | null
  sumaAsegurada: number | null
  costoFuente: 'lista' | 'inventario' | null
  inicioVig: string
  finVig: string
  fechaAnula: string | null
  motivoAnula: 'descartada' | 'contracargo' | null
  fechaSiniestro: string | null
  estado: 'emitido' | 'pendiente'
  createdAt: string
  updatedAt: string
}

export async function getCertificados(): Promise<CertificadoRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('seguros_certificados')
    .select(
      'id, numero, gocuotas_order_id, store_order_id, pedido_numero, dni, cliente, domicilio, cp, localidad, articulo, imei, costo_sin_iva, suma_asegurada, costo_fuente, inicio_vig, fin_vig, fecha_anula, motivo_anula, fecha_siniestro, estado, created_at, updated_at',
    )
    .order('numero', { ascending: true, nullsFirst: false })

  // Fail-loud: antes un error de lectura (ej. caída de DB) se devolvía como
  // [] silencioso, indistinguible de "no hay certificados" — el export del
  // broker (app/api/seguros/export/route.ts) podía salir con un Excel vacío
  // pero con pinta legítima. Ahora el error se propaga; cada caller decide
  // cómo mostrarlo (export → 500 json; página → banner de aviso, ver
  // app/(admin)/seguros/page.tsx).
  if (error) throw new Error(error.message)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    numero: r.numero as number | null,
    gocuotasOrderId: r.gocuotas_order_id as string,
    storeOrderId: r.store_order_id as string | null,
    pedidoNumero: r.pedido_numero as string | null,
    dni: r.dni as string | null,
    cliente: r.cliente as string | null,
    domicilio: r.domicilio as string | null,
    cp: r.cp as string | null,
    localidad: r.localidad as string | null,
    articulo: r.articulo as string,
    imei: r.imei as string,
    costoSinIva: r.costo_sin_iva !== null ? Number(r.costo_sin_iva) : null,
    sumaAsegurada: r.suma_asegurada !== null ? Number(r.suma_asegurada) : null,
    costoFuente: r.costo_fuente as 'lista' | 'inventario' | null,
    inicioVig: r.inicio_vig as string,
    finVig: r.fin_vig as string,
    fechaAnula: r.fecha_anula as string | null,
    motivoAnula: r.motivo_anula as 'descartada' | 'contracargo' | null,
    fechaSiniestro: r.fecha_siniestro as string | null,
    estado: r.estado as 'emitido' | 'pendiente',
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }))
}

// ---------------------------------------------------------------------------
// Siniestros (denuncias de robo cargadas por el cliente)
// ---------------------------------------------------------------------------

export type EstadoSiniestro = 'nuevo' | 'en_gestion' | 'reclamado' | 'resuelto_positivo' | 'resuelto_negativo'

export type SiniestroRow = {
  id: string
  certificadoId: string
  estado: EstadoSiniestro
  dniIngresado: string
  archivoPath: string
  fechaRobo: string | null
  montoReconocido: number | null
  nota: string | null
  createdAt: string
  resueltoAt: string | null
  // del certificado (join)
  cliente: string | null
  dni: string | null
  articulo: string
  imei: string
  sumaAsegurada: number | null
  inicioVig: string
  finVig: string
  gocuotasOrderId: string
  // mora en vivo (réplica GOcuotas) — solo para backoffice, nunca al cliente
  enMora: boolean
  diasMaximos: number
  /** true si fetchCuotasMora falló para este caso puntual (réplica caída/lenta) — degrada solo esta fila, nunca toda la pestaña. */
  moraSinDato: boolean
}

type SiniestroConCertRaw = {
  id: string
  certificado_id: string
  estado: string
  dni_ingresado: string
  archivo_path: string
  fecha_robo: string | null
  monto_reconocido: string | number | null
  nota: string | null
  created_at: string
  resuelto_at: string | null
  seguros_certificados: {
    cliente: string | null
    dni: string | null
    articulo: string
    imei: string
    suma_asegurada: string | number | null
    inicio_vig: string
    fin_vig: string
    gocuotas_order_id: string
  } | null
}

/**
 * Casos de siniestro con los datos del certificado y la mora en vivo del
 * pedido (fetchCuotasMora contra la réplica de GOcuotas) — una consulta por
 * caso; a la escala esperada (decenas de denuncias) es aceptable, no hace
 * falta batchear. Cada fetchCuotasMora está en su propio try/catch: si la
 * réplica falla o está lenta para UN caso, esa fila degrada a "sin dato"
 * (moraSinDato=true) pero el resto de la pestaña sigue andando — antes un
 * solo fetch fallido tiraba abajo todo Promise.all y getSiniestros()
 * devolvía [] (pestaña entera vacía) por culpa de un solo caso.
 */
export async function getSiniestros(): Promise<SiniestroRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('seguros_siniestros')
    .select(
      'id, certificado_id, dni_ingresado, archivo_path, estado, fecha_robo, monto_reconocido, nota, created_at, resuelto_at, seguros_certificados(cliente, dni, articulo, imei, suma_asegurada, inicio_vig, fin_vig, gocuotas_order_id)',
    )
    .order('created_at', { ascending: false })

  if (error || !data) return []

  const filas = await Promise.all(
    (data as unknown as SiniestroConCertRaw[]).map(async (r) => {
      const cert = r.seguros_certificados
      let enMora = false
      let diasMaximos = 0
      let moraSinDato = !cert
      if (cert) {
        try {
          const mora = await fetchCuotasMora(cert.gocuotas_order_id)
          enMora = mora.enMora
          diasMaximos = mora.diasMaximos
        } catch {
          moraSinDato = true
        }
      }
      return {
        id: r.id,
        certificadoId: r.certificado_id,
        estado: r.estado as EstadoSiniestro,
        dniIngresado: r.dni_ingresado,
        archivoPath: r.archivo_path,
        fechaRobo: r.fecha_robo,
        montoReconocido: r.monto_reconocido !== null ? Number(r.monto_reconocido) : null,
        nota: r.nota,
        createdAt: r.created_at,
        resueltoAt: r.resuelto_at,
        cliente: cert?.cliente ?? null,
        dni: cert?.dni ?? null,
        articulo: cert?.articulo ?? '',
        imei: cert?.imei ?? '',
        sumaAsegurada: cert?.suma_asegurada !== null && cert?.suma_asegurada !== undefined ? Number(cert.suma_asegurada) : null,
        inicioVig: cert?.inicio_vig ?? '',
        finVig: cert?.fin_vig ?? '',
        gocuotasOrderId: cert?.gocuotas_order_id ?? '',
        enMora,
        diasMaximos,
        moraSinDato,
      }
    }),
  )

  return filas
}

/** URL firmada de la denuncia (bucket privado 'denuncias-robo') por 1 hora — mismo patrón que urlCv de reclutamiento. */
export async function getDenunciaUrl(archivoPath: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.storage.from('denuncias-robo').createSignedUrl(archivoPath, 3600)
  return data?.signedUrl || null
}

/**
 * Avance de estado intermedio: nuevo→en_gestion→reclamado. La transición es
 * un UPDATE condicionado al estado de ORIGEN esperado (no read-then-write):
 * si 0 filas fueron afectadas, el caso no estaba en ese estado (ya avanzó,
 * se resolvió, o es un doble click) y se rechaza con un error claro. La
 * resolución final pasa por resolverSiniestro.
 */
export async function setEstadoSiniestro(id: string, estado: 'en_gestion' | 'reclamado'): Promise<void> {
  const estadoOrigen: EstadoSiniestro = estado === 'en_gestion' ? 'nuevo' : 'en_gestion'
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('seguros_siniestros')
    .update({ estado })
    .eq('id', id)
    .eq('estado', estadoOrigen)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error(`No se pudo pasar a "${estado}": el caso ya no está en "${estadoOrigen}" (puede haber avanzado o resuelto en otra pestaña/sesión).`)
  }

  revalidatePath('/seguros')
}

/**
 * Cierra un siniestro. Positivo exige `fechaRobo` y, además de cerrar el
 * siniestro, marca `fecha_siniestro` en el CERTIFICADO — es el cierre con
 * marca propia: detiene el devengo de prima (lib/seguros-informes.ts) y
 * llena la columna 17 del Excel del broker (Task 6). Negativo solo cierra
 * el siniestro; el certificado sigue vigente, sin tocar.
 *
 * Orden de escrituras — fail-safe: el CERTIFICADO (fuente de verdad
 * financiera) se escribe PRIMERO, el siniestro después. Si el proceso se
 * cae entre medio, un reintento es inocuo: la escritura del certificado es
 * condicional (`.is('fecha_siniestro', null)`, no-op si ya está seteada) y
 * la del siniestro también es condicional (solo si todavía no está
 * resuelto) — así no hay ventana donde el certificado quede sin marcar pero
 * el caso ya luzca cerrado.
 *
 * Guardas (ambas vía UPDATE condicional, no read-then-write — evitan el
 * TOCTOU de una lectura previa más una escritura separada):
 *  - Doble resolución: el UPDATE del siniestro solo aplica si su estado
 *    todavía es 'nuevo' | 'en_gestion' | 'reclamado'; 0 filas afectadas ⇒
 *    throw "ya estaba resuelto".
 *  - Certificado ya siniestrado por OTRO caso: el UPDATE de
 *    seguros_certificados solo aplica si fecha_siniestro es NULL. Si ya
 *    tenía una fecha (de un siniestro previo sobre el mismo certificado),
 *    NO se sobreescribe — regla de "un solo evento": la primera fecha
 *    queda. El caso actual se cierra igual (su propio fecha_robo queda
 *    guardado en el siniestro), solo que no toca la fecha del certificado.
 */
export async function resolverSiniestro(
  id: string,
  resultado: 'positivo' | 'negativo',
  opts: { fechaRobo?: string; montoReconocido?: number; nota?: string },
): Promise<void> {
  if (resultado === 'positivo' && !opts.fechaRobo) {
    throw new Error('Falta la fecha del robo para cerrar el siniestro como positivo.')
  }

  const supabase = createAdminClient()

  const { data: siniestroRaw, error: errorSiniestro } = await supabase
    .from('seguros_siniestros')
    .select('certificado_id, seguros_certificados(inicio_vig)')
    .eq('id', id)
    .single()
  if (errorSiniestro) throw new Error(errorSiniestro.message)

  const siniestro = siniestroRaw as unknown as {
    certificado_id: string
    seguros_certificados: { inicio_vig: string } | null
  }

  // Rango válido de fechaRobo (positivo únicamente): no antes de que empiece
  // la vigencia de la póliza ni después de hoy. Sin esta validación el
  // backoffice podía marcar un siniestro con cualquier fecha arbitraria
  // (fuera de cobertura o en el futuro) y quedaba igual de "cerrado".
  if (resultado === 'positivo') {
    const inicioVig = siniestro.seguros_certificados?.inicio_vig
    const hoy = new Date().toISOString().slice(0, 10)
    if (inicioVig && !fechaRoboEnRango(inicioVig, opts.fechaRobo!, hoy)) {
      throw new Error('La fecha del robo debe estar entre el inicio de vigencia y hoy.')
    }
  }

  const resueltoAt = new Date().toISOString()

  // 1) Certificado primero (positivo únicamente) — condicional a que todavía
  // no tenga fecha_siniestro; si ya la tiene (otro caso la marcó antes), se
  // deja como está y se sigue de largo.
  if (resultado === 'positivo') {
    const { error: errorCert } = await supabase
      .from('seguros_certificados')
      .update({ fecha_siniestro: opts.fechaRobo, updated_at: resueltoAt })
      .eq('id', siniestro.certificado_id)
      .is('fecha_siniestro', null)
    if (errorCert) throw new Error(errorCert.message)
  }

  // 2) Siniestro después — condicional a que no esté ya resuelto.
  const updateSiniestro =
    resultado === 'positivo'
      ? {
          estado: 'resuelto_positivo' as const,
          resuelto_at: resueltoAt,
          fecha_robo: opts.fechaRobo,
          monto_reconocido: opts.montoReconocido ?? null,
          nota: opts.nota ?? null,
        }
      : {
          estado: 'resuelto_negativo' as const,
          resuelto_at: resueltoAt,
          nota: opts.nota ?? null,
        }

  const { data: filaResuelta, error: errorUpdate } = await supabase
    .from('seguros_siniestros')
    .update(updateSiniestro)
    .eq('id', id)
    .in('estado', ['nuevo', 'en_gestion', 'reclamado'])
    .select('id')
  if (errorUpdate) throw new Error(errorUpdate.message)
  if (!filaResuelta || filaResuelta.length === 0) {
    throw new Error('Este siniestro ya estaba resuelto (puede haberse cerrado en otra pestaña/sesión).')
  }

  revalidatePath('/seguros')
}
