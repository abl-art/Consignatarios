# Arrepentimientos — ingesta automática del buzón y cola de decisión

**Fecha:** 2026-10-05 · **Estado:** aprobado por Emiliano (diseño conversado en sesión)

## Contexto y objetivo

El Botón de Arrepentimiento de la tienda (workflow de n8n) manda un mail a
`gocelulares@gocuotas.com` por cada solicitud (Ley 24.240). Hoy esos mails se
gestionan a mano. Hasta que Andreani disponibilice APIs, automatizamos la
entrada: leer el buzón, cruzar el DNI contra la réplica de GOcelular y dejar
cada solicitud como fila pendiente en una pestaña nueva **Arrepentimientos**
de `/compras/envios`, donde Yamila (operaciones) confirma el rescate o
descarta. Confirmar inyecta el rescate al flujo normal de la pestaña Rescates.

**Éxito:** ningún mail del botón se pierde ni se carga dos veces; Yamila
resuelve todo desde la pestaña sin revisar el correo.

## Alcance v1 / v2

- **v1 (esta spec):** ingesta + cola + confirmar/descartar. La anulación de
  la orden en GOcuotas la hace Yamila a mano (el descarte solo registra).
- **v2 (futuro, fuera de alcance):** anular la orden por API al descartar
  con motivo "Anulada antes del despacho"; APIs de Andreani para el rescate.

## Ingesta (cron)

- Endpoint `app/api/cron/arrepentimientos/route.ts` — `Authorization:
  Bearer CRON_SECRET`, `maxDuration` 60 (patrón control-stock).
- Job de pg_cron en Supabase cada 30 min (`*/30 * * * *`) pegándole al
  endpoint (patrón jobid 3/4 existentes).
- Conexión IMAP **solo lectura** a Gmail (`imapflow` + `mailparser`,
  dependencias nuevas): nunca marca leído, mueve ni borra mails.
- Credenciales: `MAIL_ARREPENTIMIENTOS_USER` / `MAIL_ARREPENTIMIENTOS_PASS`
  (contraseña de aplicación) en `.env.local` y Vercel. Nunca en el repo.
- Cursor: `arrepentimientos_estado` (Supabase) guarda `ultimo_uid`
  procesado. Se procesa solo UID > cursor → idempotente, sin backfill (se
  siembra el cursor con el UID más alto al deployar; si después se quiere
  backfill, se corre con `?desde_uid=`).

## Filtro "solo mails del botón"

Un mail se procesa únicamente si cumple **las tres**:

1. From exacto `gocelulares@gocuotas.com` (el botón se lo manda a sí mismo).
2. Asunto matchea la regex estricta
   `^Arrepentimiento\s*—\s*(?<nombre>.+?)\s*\(DNI\s*(?<dni>\d{6,9})\)\s*$`
   (tolera dobles espacios y tildes, vistos en mails reales).
3. El cuerpo contiene la marca `GOcelular Botón de Arrepentimiento`.

Mails con asunto parecido que fallen el filtro se cuentan y el cron devuelve
`descartados_filtro: N` en su respuesta (visibilidad si n8n cambia el
template; no se pierde en silencio).

## Cruce y dedupe (orden de evaluación por mail)

1. **Cruce primero:** busca en la réplica la orden **propia** no descartada
   más reciente del DNI (`gocuotas_orders.user_dni`, `CLIENT_IDS_PROPIOS`),
   con `store_orders` (order_number, producto) y `shipments` (tracking
   vigente: si hay más de una etiqueta, la más nueva — regla de Demoras).
   `otras_ordenes` = cuántas órdenes propias no descartadas adicionales
   tiene el DNI (opción C: aviso, no filas extra).
2. **¿Ya hay solicitud para ese DNI y ESA orden?** (en `arrepentimientos`,
   cualquier estado — pendiente/confirmada/descartada; si el mail no
   matcheó orden, compara contra solicitudes "sin orden" del mismo DNI):
   no crea fila; incrementa `insistencias` y actualiza
   `ultima_insistencia_at`. El dedupe es por DNI + orden — si el mismo
   cliente compra de nuevo más adelante y se arrepiente de la orden nueva,
   eso ES una solicitud nueva, no una insistencia.
3. **¿El rescate ya está solicitado por otro canal?** (tracking de esa
   orden con `SolicitudDeRescate` en traces o fila en
   `rescates_seguimiento`): no crea fila; registra el UID.
4. **Nuevo:** crea la fila `pendiente`. Si el DNI no matcheó ninguna
   orden, crea la fila igual marcada **sin orden** (que se vea, no que se
   pierda).

## Datos (Supabase)

```sql
-- scripts/arrepentimientos.sql
create table arrepentimientos (
  id uuid primary key default gen_random_uuid(),
  dni text not null,
  nombre text not null,
  email_uid bigint not null unique,     -- UID IMAP del primer mail
  email_fecha timestamptz not null,
  order_number text,                     -- SO-… (null = sin orden)
  gocuotas_order_id text,
  producto text,
  tracking text,                         -- null = sin despachar
  otras_ordenes int not null default 0,
  insistencias int not null default 1,
  ultima_insistencia_at timestamptz not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','confirmada','descartada')),
  descarte_motivo text,
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
create index on arrepentimientos (dni);
create index on arrepentimientos (estado);

create table arrepentimientos_estado (
  id int primary key default 1 check (id = 1),
  ultimo_uid bigint not null,
  updated_at timestamptz not null default now()
);
```

Sin RLS (patrón del repo; las server actions chequean sesión).

## UI — pestaña Arrepentimientos en /compras/envios

Pestaña nueva en EnviosTabs, al lado de Rescates, con contador de
pendientes en la solapa ("Arrepentimientos (3)").

Tabla de pendientes (orden: más viejo primero — es una cola):

| Columna | Contenido |
|---|---|
| Solicitud | fecha del primer mail + "insistió N veces" si `insistencias > 1` |
| Cliente | nombre + DNI |
| Pedido | `order_number` · `gocuotas_order_id` (o chip rojo "sin orden") |
| Producto | producto |
| Envío | tracking con link a andreani.com/envio/… o chip ámbar "sin despachar" |
| Avisos | "⚠ +N órdenes" si `otras_ordenes > 0` |
| Acciones | Confirmar rescate · Descartar |

- **Confirmar rescate** (solo habilitado con tracking; sin tracking el hint
  dice "sin despacho: anular y descartar"): llama `cargarRescate(tracking,
  'Arrepentimiento')` existente → fila a `confirmada` + `resuelto_at`. El
  rescate aparece en la pestaña Rescates como "Pendiente de aceptación"
  (flujo normal, sin cambios).
- **Descartar**: elige motivo ("Anulada antes del despacho", "Gestionado
  por otro canal", "Otro") → fila a `descartada` + motivo + `resuelto_at`.
  Soft-delete: sale de la cola pero queda para el dedupe.
- Debajo de la cola, desplegable "Resueltas" (confirmadas y descartadas,
  más recientes primero) como historial.

## Cambio menor en la pestaña Rescates

Mover la columna Order ID (ya existe, hoy última a la derecha) junto al
número de pedido, fusionadas estilo Demoras (`SO-XXXX · 18522854`), para que
Yamila copie el ID de GOcuotas sin scrollear.

## Componentes

- `lib/arrepentimientos.ts` — lógica pura testeada: `parsearAsuntoArrepentimiento`
  (regex + normalización), `esMailDelBoton` (las tres firmas), armado de
  fila y reglas de dedupe (decisión por mail: insistencia / ya-solicitado /
  nueva / sin-orden).
- `lib/actions/arrepentimientos.ts` — server actions: `getArrepentimientos`
  (cola + resueltas), `confirmarArrepentimiento`, `descartarArrepentimiento`.
- `app/api/cron/arrepentimientos/route.ts` — orquesta IMAP → filtro →
  dedupe → inserts. Devuelve resumen JSON (procesados, nuevos,
  insistencias, descartados_filtro).
- `app/(admin)/compras/envios/ArrepentimientosTable.tsx` — cliente.
- `scripts/arrepentimientos.sql` — tablas + job de pg_cron.

## Errores y resiliencia

- Caída de IMAP/Gmail en una corrida: el cron devuelve error y la corrida
  siguiente retoma desde `ultimo_uid` — no se pierde nada.
- El cursor avanza solo tras procesar el lote completo de un mail (insert o
  registro de insistencia) — si el cron muere a mitad, el mail se reintenta.
- Réplica caída durante el cruce: el mail no avanza el cursor (reintento).
- DNI inválido en asunto que pasó el filtro: cuenta como `descartados_filtro`.

## Testing

- Unit (vitest, lógica pura): regex de asunto con casos reales (dobles
  espacios, tildes, apellidos compuestos), firmas del botón, decisiones de
  dedupe, elección de orden/tracking vigente.
- Smoke manual post-deploy: correr el cron con `?force=1` sobre el buzón
  real y verificar filas + contadores; confirmar y descartar una solicitud
  de prueba con Yamila/Emiliano.
