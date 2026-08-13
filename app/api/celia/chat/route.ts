import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool, getSupabasePool } from '@/lib/db-pool'
import { ejecutarConsulta, serializarFilas } from '@/lib/celia/sql'
import { SYSTEM_CELIA } from '@/lib/celia/contexto'

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
      'Ejecuta una consulta SELECT en el Postgres de la plataforma GOcelular360 (cheques_proveedor, flujo_*, facturas, proveedores, liquidaciones, garantías, etc.). Solo lectura, máx 500 filas.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Una única sentencia SELECT (Postgres)' },
      },
      required: ['sql'],
    },
  },
]

async function ejecutarTool(nombre: string, sql: string): Promise<{ contenido: string; esError: boolean }> {
  const pool = nombre === 'consultar_gocelular' ? getPool() : getSupabasePool()
  if (!pool) return { contenido: 'Error: base de datos no configurada', esError: true }
  try {
    const { filas, truncado } = await ejecutarConsulta(pool, sql)
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

  const messages: Anthropic.MessageParam[] = [
    ...(previos ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as Anthropic.MessageParam['content'],
    })),
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

          messages.push({ role: 'assistant', content: respuesta.content })
          await admin.from('celia_mensajes').insert({
            conversacion_id: conversacionId,
            role: 'assistant',
            content: respuesta.content,
          })

          if (respuesta.stop_reason === 'tool_use') {
            const resultados: Anthropic.ToolResultBlockParam[] = []
            for (const block of respuesta.content) {
              if (block.type !== 'tool_use') continue
              const base = block.name === 'consultar_gocelular' ? 'GOcelular' : 'la plataforma'
              emitir({ tipo: 'estado', texto: `Consultando ${base}...` })
              const input = block.input as { sql: string }
              const { contenido, esError } = await ejecutarTool(block.name, input.sql)
              resultados.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: contenido,
                is_error: esError,
              })
            }
            const turnoResultados: Anthropic.MessageParam = { role: 'user', content: resultados }
            messages.push(turnoResultados)
            await admin.from('celia_mensajes').insert({
              conversacion_id: conversacionId,
              role: 'user',
              content: resultados,
            })
            continue
          }

          if (respuesta.stop_reason === 'refusal') {
            emitir({ tipo: 'error', mensaje: 'Celia no pudo responder esa consulta. Probá reformularla.' })
          } else if (respuesta.stop_reason === 'max_tokens') {
            emitir({ tipo: 'error', mensaje: 'La respuesta quedó incompleta (límite de tokens). Pedile que resuma.' })
          }
          break // end_turn u otro stop: terminamos
        }

        await admin
          .from('celia_conversaciones')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversacionId)

        emitir({ tipo: 'fin' })
      } catch (e) {
        console.error('Celia error:', e)
        emitir({ tipo: 'error', mensaje: e instanceof Error ? e.message : 'Error inesperado' })
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
