# Acciones de Andreani (Cancelar / Rescate / Devolución) por el webhook de Pedro

**Fecha:** 2026-10-28
**Autor:** Emiliano + Claude (brainstorming)
**Estado:** Diseño — pendiente de aprobación y de confirmar el contrato de Pedro

## Intent y por qué

Hoy, cuando un cliente se arrepiente de una compra, la resolución del lado
de Andreani depende del estado del envío y **obliga a Emiliano/Yami a entrar
a mano a la página de Andreani**:

- **No salió** → cancelar el pedido en el warehouse (esto YA se dispara desde
  GOcelular360 con el botón "Cancelar pedido", commit 0ac233e).
- **Expedido sin entregar** → pedir el **rescate** a Andreani. Hoy el botón
  "Confirmar" de Arrepentimientos solo lo registra localmente (lo manda a la
  pestaña Rescates); el pedido real de rescate se hace a mano en Andreani.
- **Entregado** → pedir una **devolución** (envío inverso). Hoy se hace a mano
  en Andreani y después se sigue en la pestaña Devoluciones.

El 28/10/2026 Pedro prendió en su webhook de cancelaciones las tres acciones
(`cancelar_pedido`, `cancelar_orden`, rescate y `solicitar_devolucion`), con
estados nuevos. Eso permite **disparar las tres acciones desde GOcelular360 sin
entrar nunca más a la página de Andreani**, que es el objetivo de este trabajo.

## Goals

1. Un **botón inteligente de dos pasos** en cada fila de la pestaña
   Arrepentimientos que, según el estado del envío, sabe qué acción corresponde
   (cancelar pedido / rescate / devolución) y la ejecuta por el webhook de Pedro.
2. Las pestañas **Rescates** y **Devoluciones** muestran **todos** los casos
   disparados y se siguen hasta resolverlos a mano, con los **estados nuevos de
   Pedro** visibles.
3. **No entrar más a la página de Andreani** para estas tres acciones.

## Non-goals (explícitos de Emiliano)

- **La ACCIÓN de reembolso de GOcuotas no cambia.** Se sigue haciendo con el
  botón "Anular orden" de siempre (API Redirect de GOcuotas); NO se usa
  `cancelar_orden` (que reembolsa del lado de Pedro) en esta versión. Lo que SÍ
  cambia (ver Decisiones #2 y #3) es **dónde vive y cuándo se habilita** ese
  botón: ahora viaja a Rescates/Devoluciones y su guard se reescribe.
- No se automatiza la resolución: **ningún caso se archiva solo** (regla ya
  vigente, ver memoria de rescates). El cierre es siempre manual con "✓ Resolver".
- No se reemplaza la consulta directa al tracking de Andreani (ver más abajo).

## Anti-goals (qué haría fracasar esto aunque "funcione")

- Que una acción se dispare contra producción sin que el operador haya visto y
  confirmado exactamente qué va a hacer (no hay sandbox de Andreani; un disparo
  equivocado es un envío/rescate real). El patrón de dos pasos es obligatorio.
- Que el sistema muestre un caso como resuelto cuando Andreani lo rechazó
  (ya pasó el 27/10 con `cancelacion_pedida`: nuestro cron lo dio por cancelado
  y habilitó el refund con el envío vivo).

## Decisiones de diseño tomadas

### 1. Botón inteligente de dos pasos (Arrepentimientos)

- **1er clic = preview.** Le pregunta a Pedro (`mode: preview`) por la orden y,
  con lo que responde, determina la acción que corresponde y se lo dice al
  operador en el propio botón ("voy a pedir el rescate" / "voy a pedir la
  devolución" / "voy a cancelar el pedido").
- **2do clic = apply.** Ejecuta esa acción (`mode: apply`).
- **Pedro manda sobre nuestro dato.** El ruteo de la acción se decide con la
  respuesta fresca de Pedro, no solo con nuestro `fulfillment` (que viene del
  cron de 30 min y puede estar atrasado). Ejemplo: en un "expedido" el preview
  puede responder `no_cancelable_entregado` → el botón ofrece **devolución**, no
  rescate.
- **Ruteo por estado:**
  - no salió (en cola / enviado a Andreani / pickeado) → `cancelar_pedido`
  - expedido sin entregar → rescate
  - entregado (`no_cancelable_entregado`) → `solicitar_devolucion`
- **Caso depósito local / sin pedido de WH** (ej. orden que se despacha del
  depósito local, sin pedido a Andreani → `fulfillment=null`): el preview
  responde `sin_pedido_wh`. En ese caso el botón **no dispara nada por webhook**
  y le avisa al operador que es un caso manual ("sin pedido en el warehouse —
  posible depósito local: anulá la orden y descartá"). *(Decisión del builder,
  pendiente de confirmar con Emiliano si el depósito local algún día entra al
  circuito de Pedro.)*

### 2. Pestañas Rescates y Devoluciones: dos fuentes

- **Fuente de verdad del viaje físico = la consulta directa al tracking de
  Andreani**, igual que hoy (timeline completo con duración por estado). NO se
  reemplaza.
- **Segunda fuente = el GET de Pedro** (`rescate.estado` / `devolucion.estado`
  con los valores nuevos). Se muestra al lado como estado de la acción y sirve
  de **control cruzado**.
- **Bandera de discrepancia:** cuando las dos fuentes no coinciden, se marca
  (en la línea de las banderas que ya existen en Devoluciones: `stock_sin_retorno`,
  `trustonic_activo_anulada`, `devolucion_sin_movimiento`).
- **Cierre siempre manual** ("✓ Resolver"), aunque Pedro informe
  `rescate_recibido` / `devolucion_recibida`. El estado de Pedro informa, no
  resuelve.
- **Estados terminales que cierran MAL** se muestran destacados sin resolver:
  `rescate_rechazado` (motivo en `rescate.razon`), `retiro_fallido`.

### 3. Estados nuevos de Pedro (contrato 28/10)

Rescate (paquete ya salió del depósito): `rescate_pedido`, `rescate_confirmado`
(en `cancelar_orden` el reembolso sale acá — no aplica a nosotros),
`rescate_recibido`, `rescate_rechazado`, `no_cancelable_entregado` (→ devolución).

Devolución (paquete entregado): `devolucion_pedida`, `retiro_solicitado`,
`retiro_confirmado`, `retiro_realizado`, `retiro_fallido`, `devolucion_recibida`.

`cancelado` queda solo para lo cancelado antes del despacho. Si la orden tiene
una devolución, el GET devuelve el estado de la devolución.

### 4. Soporte / trazabilidad

- Guardar y mostrar el `request_id` de cada respuesta de Pedro (él lo pide para
  diagnosticar: "si algo falla, avisanos con el request_id").
- Registrar cada apply disparado (quién, cuándo, qué acción, respuesta).

## Constraints

- **Sin sandbox de Andreani:** las pruebas son contra producción. El patrón de
  dos pasos y el preview-antes-de-apply son la única red de seguridad.
- **Firma HMAC** de siempre (`GOCELULAR_WEBHOOK_SECRET`); el GET firma `ts + "."`.
  Endpoint `https://gocelular.gocuotas.com/api/webhooks/gocelular/cancelaciones`.
- **Reglas de reintento del contrato** (ya implementadas en `lib/cancelaciones.ts`):
  `vivo` / `sin_pedido_wh` → reintentar en minutos; 409 solo si `retryable:true`;
  5xx reintentable.
- Reusar lo que ya existe: `lib/gocelular-webhook.ts` (fetch firmado),
  `lib/cancelaciones.ts` (guards puros), `lib/actions/cancelaciones.ts`,
  la columna persistida `arrepentimientos.fulfillment`, `rescates_seguimiento`,
  `devoluciones_seguimiento`.

## Lo que queda PENDIENTE antes de construir (dependencia externa)

El contrato que mandó Pedro el 28/10 **se corta a 2000 caracteres** en nuestra
tabla `novedades_gocelular`, así que faltan detalles que son load-bearing. Hay
que pedirle a Pedro (o conseguir su doc completa):

1. **Cómo se dispara el rescate.** ¿Es una acción propia del POST (ej.
   `accion: "solicitar_rescate"`) o `cancelar_pedido` sobre un expedido lo
   convierte solo en rescate ("rescate automático")? Esto define el botón.
2. **Payload exacto de `solicitar_devolucion`** (campos del POST, si acepta
   `mode: preview`, motivo, etc.).
3. **¿Preview disponible para rescate y devolución?** El botón de dos pasos
   necesita un preview que no ejecute nada. Si alguna acción no tiene preview,
   hay que rediseñar su confirmación.
4. **Forma de la respuesta** (campos `request_id`, `estado`, `rescate.razon`,
   `devolucion.estado`, `retryable`).
5. **¿`solicitar_devolucion` crea una fila de `shipments type='return'` en la
   base compartida, y en cuánto tiempo?** La pestaña Devoluciones hoy se arma
   100% de un query sobre `shipments WHERE type='return'` (keyed por el tracking
   del retorno), que a la hora de disparar todavía no existe. Si Pedro crea esa
   fila al toque, el tab la toma solo; si no, hay que agregar un store keyed por
   `order_number` y unirlo (ver builder más abajo).

## Lo que queda a criterio del builder

- Cómo se ve exactamente el botón en sus tres modos (etiquetas, colores) — se
  propondrá un mockup para que Emiliano lo apruebe.
- Dónde persistir el `request_id` y el log de applies (extender las tablas de
  seguimiento existentes vs tabla nueva).
- Mapeo fino de cada estado de Pedro a su chip/etiqueta local en las pestañas.
- Cómo exactamente se calcula la bandera de discrepancia entre las dos fuentes.
- **Rescate vs Devolución como fuente de la fila (builder-check #1):** el
  rescate NO tiene problema — un expedido ya tiene `tracking` de salida, así que
  se dispara por el `cargarRescate(tracking, …)` que ya usa "Confirmar" y
  aparece en Rescates igual que hoy. La devolución sí depende del punto 5 de
  Pedro: si su apply NO crea la fila de `shipments type='return'` al toque, el
  builder agrega un store keyed por `order_number` y lo une en `getDevoluciones`
  para mostrar la fila "devolución pedida, sin envío físico todavía". *(Mi call,
  condicionado a la respuesta de Pedro.)*
- **Cierre manual en Devoluciones (builder-check #3):** hoy Devoluciones
  auto-separa activas/finalizadas con `esDevolucionFinalizada` y no tiene
  `resuelto_at`. Para cumplir "cierre siempre manual" se agrega `resuelto_at` a
  `devoluciones_seguimiento` y la separación pasa a basarse en ESE campo (igual
  que Rescates), REEMPLAZANDO el auto-finalize. El checkbox `recibido_wh` queda
  como paso intermedio y el `devolucion_recibida` de Pedro solo informa. *(Mi
  call, consistente con la regla "nada se archiva solo".)*

## Decisiones de Emiliano (resueltas 28/10)

1. **Cuándo sale de la cola de Arrepentimientos.** Sale cuando Yami **confirma
   el botón inteligente (apply)**: ese es el gesto con el que Yami cierra el
   arrepentimiento y pasa al siguiente. El caso se sigue después en
   Rescates/Devoluciones hasta el cierre manual; un rechazo
   (`rescate_rechazado` / `retiro_fallido`) queda **destacado ahí** como backstop.

2. **El botón "Anular orden" VIAJA con la línea.** El reembolso (API Redirect de
   GOcuotas, la acción NO cambia) deja de vivir solo en Arrepentimientos: aparece
   también en **Rescates y Devoluciones**, porque Yami va a anular la orden desde
   donde esté el caso. Esto implica **reescribir el guard `puedeAnularOrden`**
   para no bloquear todo lo `expedido`, sino habilitar el reembolso según el
   estado de la acción (ver punto 3).

3. **Cuándo se habilita el reembolso** (es un PISO de habilitación; Yami decide
   cuándo efectivamente pedir la anulación — no es automático):
   - **Rescate:** habilitado cuando el estado es `rescate_confirmado` (Andreani
     aceptó, el equipo vuelve). *(Mi call como piso; Yami decide el momento.)*
   - **Devolución:** habilitado cuando la devolución está **`retiro_realizado`**
     (el equipo ya fue retirado del cliente). *(Regla de Emiliano.)*
   - En ambos casos el estado solo HABILITA el botón; el disparo del reembolso lo
     hace Yami a criterio.
