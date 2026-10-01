import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool, getSupabasePool } from '@/lib/db-pool'
import { ejecutarConsulta, serializarFilas } from '@/lib/celia/sql'
import { SYSTEM_CELIA } from '@/lib/celia/contexto'
import { crearBorradorNovedad } from '@/lib/actions/novedades'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_ITERACIONES = 15

const tools: Anthropic.Tool[] = [
  {
    name: 'consultar_gocelular',
    description:
      'Ejecuta una consulta SELECT en el Postgres EXTERNO de GOcelular (ventas, órdenes gocuotas_orders/store_orders, inventario inventory_items, modelos device_models, productos store_products). Solo lectura, máx 500 filas.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Una única sentencia SELECT (Postgres)' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'consultar_supabase',
    description:
      'Ejecuta una consulta SELECT en el Postgres de la plataforma GOcelular360 (cheques_proveedor, flujo_*, facturas, proveedores, liquidaciones, garantías, novedades_gocelular/novedades_enviadas, etc.). Solo lectura, máx 500 filas.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Una única sentencia SELECT (Postgres)' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'redactar_novedad',
    description:
      'Crea un BORRADOR de novedad para el equipo de GOcelular (Pedro). NO la envía: queda en estado borrador y Emiliano la revisa y despacha con un click desde /novedades → Enviadas. Usala cuando Emiliano pida informar o responder algo a GOcelular. Antes de redactar, consultá los datos reales con las otras tools — nunca inventes cifras ni referencias.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título de la novedad (máx 200 caracteres)' },
        detalle: { type: 'string', description: 'Cuerpo con el contexto completo (máx 2000 caracteres)' },
        tipo: { type: 'string', enum: ['schema', 'feature', 'aviso'], description: 'Tipo de novedad (default aviso)' },
        referencia: { type: 'string', description: 'Referencia corta: pedido, IMEI, endpoint, request_id (máx 200)' },
        en_respuesta_a: {
          type: 'string',
          description: 'Solo si responde a una novedad recibida de GOcelular: el id_externo (uuid) de esa novedad en novedades_gocelular. Las novedades viejas sin id_externo no se pueden hilar — omitilo.',
        },
      },
      required: ['titulo'],
    },
  },
]

async function ejecutarTool(nombre: string, input: Record<string, unknown>): Promise<{ contenido: string; esError: boolean }> {
  if (nombre === 'redactar_novedad') {
    const r = await crearBorradorNovedad({
      titulo: String(input.titulo ?? ''),
      detalle: input.detalle ? String(input.detalle) : undefined,
      tipo: input.tipo ? String(input.tipo) : 'aviso',
      referencia: input.referencia ? String(input.referencia) : undefined,
      enRespuestaA: input.en_respuesta_a ? String(input.en_respuesta_a) : undefined,
    })
    if (!r.ok) return { contenido: `No se pudo crear el borrador: ${r.error}`, esError: true }
    return {
      contenido: `Borrador creado (id ${r.id}). NO fue enviado: Emiliano lo revisa y despacha desde /novedades → pestaña "Enviadas a GOcelular". Avisale que tiene un borrador esperando aprobación.`,
      esError: false,
    }
  }

  const pool = nombre === 'consultar_gocelular' ? getPool() : getSupabasePool()
  if (!pool) return { contenido: 'Error: base de datos no configurada', esError: true }
  try {
    const { filas, truncado } = await ejecutarConsulta(pool, String(input.sql ?? ''))
    const cuerpo = serializarFilas(filas)
    return {
      contenido: truncado ? `${cuerpo}\n[RESULTADO TRUNCADO a 500 filas]` : cuerpo,
      esError: false,
    }
  } catch (e) {
    return { contenido: `Error SQL: ${e instanceof Error ? e.message : String(e)}`, esError: true }
  }
}

export async function POST(request: Request) {
  // Auth: solo admin
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.rol !== 'admin') {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
  }

  const { conversacionId, mensaje } = await request.json()
  if (!conversacionId || !mensaje?.trim()) {
    return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 })
  }

  const admin = createAdminClient()

  // Cargar historial previo (bloques completos, incluidos tool_use/tool_result)
  const { data: previos, error: errorPrevios } = await admin
    .from('celia_mensajes')
    .select('role, content')
    .eq('conversacion_id', conversacionId)
    .order('created_at', { ascending: true })

  if (errorPrevios) {
    console.error('Celia error cargando historial:', errorPrevios)
    return new Response(JSON.stringify({ error: 'No se pudo cargar el historial' }), { status: 500 })
  }

  // Saneo del historial rehidratado: un content vacío/falsy (p.ej. un
  // refusal que no llegamos a persistir bien, o una fila corrupta) puede
  // brickear la conversación entera si lo mandamos tal cual a la API.
  const historialSaneado = (previos ?? [])
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as Anthropic.MessageParam['content'],
    }))
    .filter((m) => Array.isArray(m.content) ? m.content.length > 0 : !!m.content)

  // Si el último mensaje persistido es un assistant con bloques tool_use,
  // significa que el turno se cortó antes de guardar el tool_result
  // correspondiente. Ese tool_use quedaría huérfano (sin tool_result) y la
  // API lo rechaza — lo eliminamos.
  if (historialSaneado.length > 0) {
    const ultimo = historialSaneado[historialSaneado.length - 1]
    const tieneToolUseHuerfano =
      ultimo.role === 'assistant' &&
      Array.isArray(ultimo.content) &&
      ultimo.content.some((b) => b.type === 'tool_use')
    if (tieneToolUseHuerfano) historialSaneado.pop()
  }

  const messages: Anthropic.MessageParam[] = [
    ...historialSaneado,
    { role: 'user', content: mensaje },
  ]

  // Persistir el mensaje del usuario ya mismo
  const { error: errorInsertUser } = await admin.from('celia_mensajes').insert({
    conversacion_id: conversacionId,
    role: 'user',
    content: [{ type: 'text', text: mensaje }],
  })

  if (errorInsertUser) {
    console.error('Celia error insertando mensaje de usuario:', errorInsertUser)
    return new Response(JSON.stringify({ error: 'Conversación inexistente' }), { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emitir = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        } catch {
          // El cliente se desconectó — no hay a quién emitir
        }
      }

      let terminoNormal = false

      try {
        for (let i = 0; i < MAX_ITERACIONES; i++) {
          const msgStream = anthropic.messages.stream({
            model: 'claude-opus-5',
            max_tokens: 16000,
            system: [{ type: 'text', text: SYSTEM_CELIA, cache_control: { type: 'ephemeral' } }] as Anthropic.TextBlockParam[],
            tools,
            messages,
          })

          msgStream.on('text', (delta) => emitir({ tipo: 'texto', delta }))

          const respuesta = await msgStream.finalMessage()

          // No persistir/encolar mensajes assistant con content vacío
          // (p.ej. un refusal sin bloques): rompería el próximo turno y
          // ensuciaría el historial para conversaciones futuras.
          if (respuesta.content.length > 0) {
            messages.push({ role: 'assistant', content: respuesta.content })
            const { error: errorInsertAssistant } = await admin.from('celia_mensajes').insert({
              conversacion_id: conversacionId,
              role: 'assistant',
              content: respuesta.content,
            })
            if (errorInsertAssistant) {
              // La respuesta ya se streameó al cliente; no abortamos por un
              // fallo de persistencia. El saneo del historial al inicio
              // protege futuras conversaciones de un mensaje corrupto.
              console.error('Celia error insertando mensaje de assistant:', errorInsertAssistant)
            }
          }

          if (respuesta.stop_reason === 'tool_use') {
            const resultados: Anthropic.ToolResultBlockParam[] = []
            for (const block of respuesta.content) {
              if (block.type !== 'tool_use') continue
              const estado =
                block.name === 'redactar_novedad'
                  ? 'Redactando borrador de novedad...'
                  : `Consultando ${block.name === 'consultar_gocelular' ? 'GOcelular' : 'la plataforma'}...`
              emitir({ tipo: 'estado', texto: estado })
              const { contenido, esError } = await ejecutarTool(block.name, block.input as Record<string, unknown>)
              resultados.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: contenido,
                is_error: esError,
              })
            }
            const turnoResultados: Anthropic.MessageParam = { role: 'user', content: resultados }
            messages.push(turnoResultados)
            const { error: errorInsertToolResults } = await admin.from('celia_mensajes').insert({
              conversacion_id: conversacionId,
              role: 'user',
              content: resultados,
            })
            if (errorInsertToolResults) {
              console.error('Celia error insertando tool_results:', errorInsertToolResults)
            }
            continue
          }

          if (respuesta.stop_reason === 'refusal') {
            emitir({ tipo: 'error', mensaje: 'Celia no pudo responder esa consulta. Probá reformularla.' })
          } else if (respuesta.stop_reason === 'max_tokens') {
            emitir({ tipo: 'error', mensaje: 'La respuesta quedó incompleta (límite de tokens). Pedile que resuma.' })
          }
          terminoNormal = true
          break // end_turn u otro stop: terminamos
        }

        if (!terminoNormal) {
          emitir({
            tipo: 'error',
            mensaje: 'Celia alcanzó el límite de consultas para esta pregunta. Probá reformularla o dividirla.',
          })
        }

        await admin
          .from('celia_conversaciones')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversacionId)

        emitir({ tipo: 'fin' })
      } catch (e) {
        console.error('Celia error:', e)
        const mensajeError = e instanceof Error ? e.message : String(e)
        const esContextoExcedido = /prompt is too long|context/i.test(mensajeError)
        emitir({
          tipo: 'error',
          mensaje: esContextoExcedido
            ? 'La conversación se hizo demasiado larga. Abrí una conversación nueva para seguir.'
            : (e instanceof Error ? e.message : 'Error inesperado'),
        })
      } finally {
        try {
          controller.close()
        } catch {
          // Puede estar ya cerrado si el cliente se desconectó
        }
      }
    },
    cancel() {
      // El cliente se desconectó a mitad de stream. No hace falta abortar
      // las llamadas en curso (deferred como minor conocido); emitir()
      // y el close() en el finally ya son no-op seguros en ese caso.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
