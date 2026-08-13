# Celia — Asistente AI de GOcelular360

**Fecha:** 2026-08-13
**Estado:** Diseño aprobado por Emiliano

## Objetivo

Página de chat "Celia" (Cel + IA) dentro del panel admin donde Emiliano puede hacer preguntas en lenguaje natural sobre todos los datos de la plataforma (ventas GOcelular, echeqs, inventario, finanzas, compras, liquidaciones, garantías) y recibir respuestas directas con los datos reales.

## Decisiones tomadas

- **Usuarios:** solo el admin (Emiliano). Sin scoping por usuario.
- **Alcance de datos:** todo lo que ve la app (DB externa GOcelular + Supabase).
- **Ubicación:** página dedicada `/celia` en el menú admin, con icono SVG de asistente mujer y historial de conversaciones.
- **Enfoque técnico (Opción A):** agente con herramientas SQL de solo lectura + manual de esquema, en vez de herramientas curadas por pregunta. Si con el uso aparecen preguntas frecuentes que merecen precisión garantizada, se promoverán a herramientas dedicadas (evolución natural a híbrido).

## Arquitectura

### Frontend — `app/(admin)/celia/`

- Entrada "Celia" en el sidebar admin (icono SVG asistente mujer), ruta `/celia`.
- Layout dos paneles: izquierda historial de conversaciones (título auto-generado de la primera pregunta, "Nueva conversación", borrar), derecha el chat.
- Streaming de respuestas (SSE) con render markdown (tablas, listas).
- Indicador de actividad mientras Celia ejecuta consultas ("Consultando ventas...").
- Estética Finanzas-style: tablas compactas, botones `bg-gray-900`.

### Backend — `app/api/celia/chat/route.ts`

- POST `{ conversacion_id, mensaje }` → respuesta en streaming SSE.
- Loop agéntico con `@anthropic-ai/sdk` (ya instalado, v0.112.2): modelo **`claude-opus-5`**, streaming, thinking adaptativo (default del modelo), límite de ~15 iteraciones de herramientas por pregunta.
- `maxDuration` alto (según plan de Vercel) porque una pregunta puede encadenar varias consultas.
- Auth: solo admin (misma autenticación del panel).
- Manejo de `stop_reason` antes de leer `content` (incluye `refusal` y `max_tokens`).

### Herramientas (tools)

1. **`consultar_gocelular(sql)`** — SELECT contra la DB externa de GOcelular vía el pool existente (`lib/gocelular.ts` / `lib/db-pool.ts`). La conexión ya es read-only.
2. **`consultar_supabase(sql)`** — SELECT contra el Postgres de Supabase vía conexión directa. Requiere nueva env `SUPABASE_DB_URL` (connection string del pooler) en `.env.local` y Vercel.

**Guardrails en código (no dependen del modelo):**

- Una única sentencia; se rechaza todo lo que no sea SELECT (INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/GRANT, `;` múltiples, CTEs con data-modifying statements).
- Máximo 500 filas por resultado (LIMIT forzado); resultado truncado se informa a Celia.
- `statement_timeout` de 15 segundos.
- Errores SQL vuelven como `tool_result` con `is_error: true` para que Celia se autocorrija.

### Manual de esquema — `lib/celia/contexto.ts`

System prompt (estable, con `cache_control` para prompt caching) que incluye:

- Esquema de tablas de ambas bases (tablas, columnas, tipos, relaciones clave).
- Reglas de negocio: filtro `client_id IN ('1','2026134','2461631','5495277')` en queries de finanzas; `total_order_amount > 5M` se divide por 100 (centavos); comisiones sobre neto (precio/1.21); tablas `cheques_proveedor` sincronizada del sheet por cron (columnas fecha_pago/importe/estado); prefijos `gocuotas_` en DB externa; ventas desde 2026-03-23.
- Instrucciones de estilo: responder en español, montos formateados AR, citar de qué tabla/consulta salió cada número, ofrecer detalle si la respuesta es agregada.

### Historial — Supabase

```sql
celia_conversaciones (id uuid pk, titulo text, created_at, updated_at)
celia_mensajes (id uuid pk, conversacion_id fk, role text, content jsonb, created_at)
```

- `content` guarda los bloques completos (texto + tool_use + tool_result) para poder retomar conversaciones con contexto íntegro y auditar de dónde salió cada número. La UI solo renderiza los bloques de texto.
- Título de la conversación: primeras palabras de la primera pregunta.

## Manejo de errores

- Error SQL → tool_result con `is_error`, Celia reintenta (cap de iteraciones evita loops).
- Error de API Anthropic → mensaje claro en el chat + botón reintentar; el mensaje del usuario no se pierde.
- Conversación que excede contexto: por ahora se sugiere abrir conversación nueva (compaction queda fuera de v1).

## Costos

Pregunta típica: US$0,05–0,30 (Opus 5, $5/$25 por MTok) con prompt caching del manual de esquema.

## Verificación

1. `npx tsc --noEmit` limpio.
2. Preguntas de referencia comparadas contra la app:
   - "¿Cuántos celulares vendió Riiing hoy?" vs Dashboard360.
   - "¿Cuánto le debemos a Newsan en echeqs pendientes?" vs cálculo del 13/08/2026 ($155.882.591,07, cheque 30094471, vence 30/09).
   - Una pregunta de inventario y una de finanzas.
3. Verificar que los guardrails rechazan un UPDATE/DELETE.
4. Deploy con `npx vercel --prod --yes` y prueba en producción.

## Fuera de alcance (v1)

- Acceso para consignatarios u otros usuarios.
- Herramientas curadas por pregunta (posible v2).
- Gráficos generados por Celia (responde con tablas/texto).
- Acciones de escritura (Celia solo lee).
