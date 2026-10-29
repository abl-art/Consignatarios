# GOcelular, API de cancelación de pedidos y reembolso de órdenes

## Qué hace este endpoint

Desde el 360 podés pedir la cancelación de un pedido que GOcelular tiene en el depósito de Andreani, y opcionalmente el reembolso total de la orden en GOcuotas. Si el paquete ya salió del depósito, pedimos el rescate del envío a Andreani. Si ya se entregó, podés pedir la devolución. Es un endpoint hermano de los webhooks de compras, venta mayorista y precios. Usa la misma autenticación y el mismo formato de errores.

Hay tres acciones y la diferencia importa.

| `accion`               | Qué hace                                                                                                                                                                        | Qué NO hace                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `cancelar_pedido`      | Frena el pedido en el depósito de Andreani. La orden de GOcuotas sigue viva, por ejemplo para modificar los datos y reenviar.                                                   | No toca la orden de GOcuotas ni devuelve plata.                                                               |
| `cancelar_orden`       | Cancela el pedido en Andreani y además reembolsa la orden completa en GOcuotas, lo que la anula. Solo para órdenes del ecommerce, se identifica con `order_number`.             | No existe para ventas mayoristas. Con `proforma_number` responde 400.                                         |
| `solicitar_devolucion` | Pide la devolución de un pedido ya entregado, con retiro en el domicilio del cliente o entrega en una sucursal de Andreani. Devuelve el tracking y la etiqueta. Solo ecommerce. | No reembolsa. El reembolso lo decide un operador cuando recibe el equipo. Con `proforma_number` responde 400. |

Hay cuatro operaciones.

| Operación | Método                                                                | Qué hace                                                                              |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Preview   | `POST /api/webhooks/gocelular/cancelaciones` con `mode: "preview"`    | Te dice qué haría `apply`, sin escribir nada.                                         |
| Apply     | `POST /api/webhooks/gocelular/cancelaciones` con `mode: "apply"`      | Ejecuta la acción.                                                                    |
| Estado    | `GET /api/webhooks/gocelular/cancelaciones?order_number=...`          | Devuelve el estado vigente del pedido, del reembolso, del rescate y de la devolución. |
| Etiqueta  | `GET /api/webhooks/gocelular/cancelaciones/etiqueta?order_number=...` | Devuelve el PDF de la etiqueta de la devolución.                                      |

Hay dos interruptores de nuestro lado, la cancelación y el reembolso, y **los dos arrancan apagados**. Mientras estén apagados, `apply` responde 503, pero `preview` y `GET` funcionan siempre con firma válida, así podés integrar y ensayar sin riesgo. Te avisamos cuando los prendamos.

---

## URL + autenticación

```
GET  https://gocelular.gocuotas.com/api/webhooks/gocelular/cancelaciones?order_number=SO-XXXXXX
GET  https://gocelular.gocuotas.com/api/webhooks/gocelular/cancelaciones/etiqueta?order_number=SO-XXXXXX
POST https://gocelular.gocuotas.com/api/webhooks/gocelular/cancelaciones
Content-Type: application/json
X-Gocelular-Signature: <hex hmac-sha256>
X-Gocelular-Timestamp: <ISO-8601 con offset>
```

La autenticación es exactamente la misma que la de compras, venta mayorista y precios, con el mismo secret. Reusá el cliente de firma.

1. Tomá el raw body exacto que vas a mandar. Para el `GET` de estado el body es la cadena vacía. El `GET` de la etiqueta firma otra cosa, ver su sección.
2. Generá un timestamp ISO-8601 con offset explícito (ej. `2026-10-27T10:30:00-03:00`). El mismo string va en el header y en el material firmado.
3. Concatená `timestamp + "." + rawBody`. Para el `GET` queda `timestamp + "."`. La firma del `GET` no incluye el query string.
4. `HMAC-SHA256(secret, esa_concatenación)` en hex minúscula, en `X-Gocelular-Signature`.

El timestamp tiene una ventana de frescura de 5 minutos. El body máximo es 1 MB.

---

## POST, payload

```json
{
  "mode": "preview",
  "accion": "cancelar_pedido",
  "order_number": "SO-XXXXXX",
  "motivo": "El cliente pidió modificar la dirección de entrega",
  "source": "360"
}
```

| Campo                              | Regla                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                             | `preview` o `apply`.                                                                                                                                                                                                                                                |
| `accion`                           | `cancelar_pedido`, `cancelar_orden` o `solicitar_devolucion`.                                                                                                                                                                                                       |
| `order_number` / `proforma_number` | Exactamente uno de los dos, hasta 64 caracteres. `order_number` es ecommerce, `proforma_number` es venta mayorista.                                                                                                                                                 |
| `motivo`                           | De 10 a 500 caracteres. Queda registrado en el pedido como `pedida por el 360: <motivo>`.                                                                                                                                                                           |
| `source`                           | Obligatorio, hasta 64 caracteres.                                                                                                                                                                                                                                   |
| `modalidad`                        | Solo en `solicitar_devolucion`, y ahí es obligatorio. `domicilio` (Andreani pasa a buscar el paquete) o `sucursal` (el cliente lo lleva a una sucursal). En las otras acciones responde 400.                                                                        |
| `ventana`                          | Opcional, solo en `solicitar_devolucion` con `domicilio`. `{ "inicio": ISO, "fin": ISO }` con offset explícito, las dos fechas en el futuro y `fin` posterior a `inicio`. Sin `ventana`, el retiro se pide para el próximo día hábil de 9 a 18 (hora de Argentina). |

Cualquier campo desconocido rechaza el request. Una acción por request.

Ejemplo de `solicitar_devolucion`.

```json
{
  "mode": "apply",
  "accion": "solicitar_devolucion",
  "order_number": "SO-XXXXXX",
  "motivo": "El equipo llegó con la pantalla rota",
  "source": "360",
  "modalidad": "domicilio",
  "ventana": {
    "inicio": "2026-10-30T09:00:00-03:00",
    "fin": "2026-10-30T18:00:00-03:00"
  }
}
```

---

## Respuesta 200

```json
{
  "result": "ok",
  "request_id": "uuid",
  "tipo": "ecommerce",
  "resultado": "cancelacion_pedida",
  "estado_wh": "cancel_requested",
  "reembolso": null,
  "devolucion": null
}
```

`resultado` toma estos valores. Separamos siempre lo que pedimos de lo que Andreani confirmó.

**Cancelación antes del despacho**

| `resultado`                   | Significado                                                                                                                               | Qué hacer                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `cancelacion_pedida`          | Se la pedimos a Andreani y falta su confirmación.                                                                                         | Consultá el `GET` hasta que pase a `cancelado`. Puede pasar a `cancelacion_pedida_por_mail` si Andreani la rechaza.        |
| `cancelacion_pedida_por_mail` | Andreani rechazó la cancelación por API (el pedido ya estaba en preparación) o no respondió, y se la pedimos por mail. No está cancelado. | Consultá el `GET`. La respuesta de Andreani puede tardar horas. Si el paquete sale igual, pasa a `no_cancelable_expedido`. |
| `cancelado`                   | Andreani confirmó la cancelación y el pedido nunca salió del depósito.                                                                    | Nada.                                                                                                                      |

**Rescate (el paquete ya salió del depósito)**

| `resultado`               | Significado                                                                                                                                                                 | Qué hacer                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `rescate_pedido`          | Le pedimos el rescate a Andreani y falta su respuesta. También cuando el envío todavía no tiene admisión o sucursal, y lo mandamos solos apenas se pueda (`rescate.razon`). | Consultá el `GET`. No reintentes el `apply`.                                                              |
| `rescate_confirmado`      | Andreani aceptó el rescate y el paquete vuelve a nuestra oficina. En `cancelar_orden` el reembolso sale en este momento.                                                    | Consultá el `GET` hasta `rescate_recibido`.                                                               |
| `rescate_recibido`        | El paquete volvió a nuestra oficina.                                                                                                                                        | Nada.                                                                                                     |
| `rescate_rechazado`       | Andreani rechazó el rescate. El motivo viaja en `rescate.razon`. En `cancelar_orden` el reembolso queda `descartado`.                                                       | Un operador de GOcelular lo resuelve. Si el paquete llega al cliente, corresponde `solicitar_devolucion`. |
| `no_cancelable_expedido`  | El paquete ya salió y el rescate todavía no se pidió.                                                                                                                       | Con el rescate automático activo, un nuevo `apply` lo pide. Si no, lo resuelve un operador de GOcelular.  |
| `no_cancelable_entregado` | El paquete ya se entregó al cliente. No se pidió rescate ni se registró reembolso.                                                                                          | Usá `solicitar_devolucion`.                                                                               |

**Devolución (el paquete se entregó)**

Los mismos valores que `devolucion.estado`, descriptos en el bloque `devolucion`. El `apply` de `solicitar_devolucion` devuelve el estado en que quedó, normalmente `retiro_confirmado` en domicilio y `devolucion_pedida` en sucursal.

**Otros**

| `resultado`         | Significado                                                                              | Qué hacer                                              |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `requiere_atencion` | El pedido está en la cola de un operador.                                                | Esperá, lo resuelve una persona.                       |
| `no_es_wh`          | No hay pedido en Andreani (stock local o equipo ya asignado).                            | Nada para cancelar en el depósito.                     |
| `sin_pedido_wh`     | La orden está paga pero todavía no tiene pedido en el depósito.                          | **Reintentá** con backoff, el pedido se crea en breve. |
| `vivo`              | No se pudo cancelar todavía y el pedido sigue activo (carrera perdida o envío en curso). | **Reintentá** con backoff.                             |

Si la orden ya está `reembolsada` y el pedido todavía está vivo, la respuesta es 200 `requiere_atencion` con el reembolso `reembolsado`. Es una inconsistencia que revisa una persona.

Repetir el mismo `apply` sobre un pedido ya cancelado, con cancelación pedida o con rescate pedido o confirmado es seguro. Devuelve el estado vigente y no manda otra cancelación ni otro rescate. Repetir `solicitar_devolucion` también es seguro. Devuelve la misma devolución y no pide un segundo retiro.

### Rescate automático

Un `cancelar_pedido` o `cancelar_orden` sobre un pedido que ya salió del depósito le pide el rescate del envío a Andreani, sin que cambies nada en la llamada. Antes de pedirlo miramos el envío en vivo. Si ya se entregó, la respuesta es `no_cancelable_entregado` y no se registra reembolso.

El rescate automático se prende de nuestro lado y te avisamos cuando esté activo. Mientras esté apagado, `cancelar_pedido` devuelve `no_cancelable_expedido` y `cancelar_orden` sobre una orden con equipo devuelve el 409 `orden_con_equipo`.

Un rescate que Andreani confirma aunque se haya pedido por su portal también se informa como `rescate_confirmado`.

En `cancelar_orden` sobre un pedido que ya salió no aplica el conflicto `orden_con_equipo`. El equipo se desvincula cuando Andreani confirma el rescate, y recién ahí sale el reembolso. Mientras tanto el reembolso queda `pendiente`. Si Andreani rechaza el rescate, queda `descartado`.

Si el rescate no se pudo pedir (por ejemplo, el envío no tenía un estado rescatable), un segundo `apply` lo vuelve a intentar.

### Bloque `reembolso`

Es `null` para `cancelar_pedido`. Para `cancelar_orden` tiene esta forma.

```json
{ "estado": "pendiente", "monto": null, "id_gocuotas": null }
```

| `estado`      | Significado                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pendiente`   | Registrado, todavía no sale. Si falla la autenticación contra GOcuotas sigue `pendiente` y se reintenta solo. Si queda trabado más de una hora, avisamos a un operador. |
| `reembolsado` | GOcuotas confirmó el reembolso total. `monto` e `id_gocuotas` vienen completos.                                                                                         |
| `incierto`    | La llamada a GOcuotas no dio una respuesta confiable. No se reintenta sola, un operador lo revisa.                                                                      |
| `descartado`  | No va a salir (Andreani no confirmó la cancelación, rechazó el rescate, la orden tenía equipo asignado o la cancelación nunca llegó a pedirse).                         |
| `error`       | GOcuotas rechazó el reembolso, o la tienda quedó sin credenciales. La cancelación en Andreani ya está hecha. Lo revisa un operador.                                     |

**El reembolso solo sale después de que Andreani confirma la cancelación.** Hacerlo antes dejaría al cliente con la plata y con el equipo si Andreani la rechaza. Por eso un `cancelar_orden` sobre un pedido ya enviado a Andreani responde `cancelacion_pedida` con reembolso `pendiente`, y tenés que consultar el `GET` hasta ver `reembolsado`.

### Caso borde, pedido en `sending`

Un `cancelar_orden` sobre un pedido que justo está en `sending` (el envío a Andreani está en curso) responde 200 `cancelado` o `requiere_atencion`, con `reembolso.estado = "pendiente"`. En los dos casos ese reembolso **nunca va a salir**. Se descarta porque no podemos confirmar con Andreani que el paquete no salió. Reintentar el mismo `cancelar_orden` devuelve 409 `cancelacion_no_confirmada`. Tratalo como un caso para un operador de GOcelular.

### Bloque `devolucion`

Es `null` para `cancelar_pedido` y `cancelar_orden`. Para `solicitar_devolucion` tiene esta forma.

```json
{
  "estado": "retiro_confirmado",
  "modalidad": "domicilio",
  "tracking": "360002612345670",
  "etiqueta_url": "https://gocelular.gocuotas.com/api/webhooks/gocelular/cancelaciones/etiqueta?order_number=SO-XXXXXX"
}
```

| `estado`              | Significado                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `devolucion_pedida`   | Creamos el envío inverso con su etiqueta. En `domicilio` todavía no pedimos el retiro. En `sucursal`, falta que el cliente lleve el paquete. |
| `retiro_solicitado`   | Solo `domicilio`. Le pedimos el retiro a Andreani y todavía no respondió. Suele durar segundos, si se queda acá lo revisa un operador.       |
| `retiro_confirmado`   | Solo `domicilio`. Andreani aceptó el retiro y va a pasar a buscar el paquete.                                                                |
| `retiro_realizado`    | El paquete ya está viajando hacia nosotros. En `sucursal`, el cliente lo dejó en la sucursal.                                                |
| `retiro_fallido`      | Andreani no pudo retirar el paquete, lo devolvió, o rechazó el pedido de retiro. Lo revisa un operador.                                      |
| `devolucion_recibida` | El paquete llegó a nuestra oficina.                                                                                                          |

`tracking` y `etiqueta_url` son `null` hasta que Andreani crea el envío. En el `preview` vienen en `null`, salvo que la orden ya tenga una devolución de la misma modalidad que se reusaría, y entonces vienen los de esa devolución. `etiqueta_url` es la ruta firmada de la etiqueta, descripta más abajo.

---

## GET, estado

`GET /api/webhooks/gocelular/cancelaciones?order_number=SO-XXXXXX` o `?proforma_number=PF-...`. Exactamente un parámetro.

```json
{
  "request_id": "uuid",
  "tipo": "ecommerce",
  "estado": "cancelacion_pedida",
  "estado_wh": "cancel_requested",
  "canal": "api",
  "reembolso": { "estado": "pendiente", "monto": null, "id_gocuotas": null },
  "rescate": null,
  "devolucion": null,
  "actualizado": "2026-10-27T13:05:00.000Z"
}
```

Con un rescate pedido se ve así.

```json
{
  "request_id": "uuid",
  "tipo": "ecommerce",
  "estado": "rescate_rechazado",
  "estado_wh": "requires_attention",
  "canal": null,
  "reembolso": { "estado": "descartado", "monto": null, "id_gocuotas": null },
  "rescate": {
    "estado": "rescate_rechazado",
    "razon": "el envío ya está en distribución",
    "tracking": "360002698765430"
  },
  "devolucion": null,
  "actualizado": "2026-10-28T15:40:00.000Z"
}
```

`estado` toma los mismos valores que `resultado` de arriba. Si la orden tiene una devolución, `estado` es el de la devolución. `estado_wh` es el estado crudo, solo para depuración, decidí siempre por `estado`. `canal` indica si la cancelación se pidió a Andreani por `api` o por `mail`, o `null`. Con `404` el número no existe.

`rescate` es `null` si nunca se pidió un rescate para la orden. Si no, trae el último pedido.

`rescate.estado` usa el mismo vocabulario que `estado`: `rescate_pedido`, `rescate_confirmado`, `rescate_recibido`, `rescate_rechazado`, o `requiere_atencion` si no se pudo pedir y lo revisa un operador. `razon` explica la espera o el rechazo.

`devolucion` tiene la misma forma que en el `apply` y es `null` si la orden no tiene devolución. Para mayoristas los dos bloques son siempre `null`. Solo se informan rescates y devoluciones pedidos desde el 28 de octubre de 2026.

---

## GET, etiqueta

`GET /api/webhooks/gocelular/cancelaciones/etiqueta?order_number=SO-XXXXXX`. Es la URL que viaja en `devolucion.etiqueta_url`. Solo admite `order_number`.

Usa el mismo secret y los mismos headers, pero el material firmado incluye el número de orden, así una firma sirve para una sola orden.

1. Material firmado: `timestamp + "." + order_number`, con el valor de `order_number` tal cual va en el query string antes de codificarlo para la URL. Para `SO-XXXXXX` queda `2026-10-30T10:30:00-03:00.SO-XXXXXX`.
2. `HMAC-SHA256(secret, ese_material)` en hex minúscula, en `X-Gocelular-Signature`, y el mismo timestamp en `X-Gocelular-Timestamp`.

Una firma con el body vacío, como la del `GET` de estado, se rechaza con 401.

Con 200 devuelve el PDF de la etiqueta de la devolución, con `Content-Type: application/pdf`. Se la mandás al cliente para que la pegue en el paquete.

| HTTP | `code`            | Cuándo                                                                                        |
| ---- | ----------------- | --------------------------------------------------------------------------------------------- |
| 400  | `invalid_payload` | Viene otro parámetro además de `order_number`, o el número está vacío o supera 64 caracteres. |
| 401  | `unauthorized`    | Falta `order_number`, o la firma falta o no corresponde a ese `order_number`.                 |
| 404  | `not_found`       | El número no existe.                                                                          |
| 404  | `sin_etiqueta`    | La orden no tiene devolución con etiqueta todavía.                                            |
| 500  | `internal_error`  | No pudimos bajar la etiqueta de Andreani. Reintentá con backoff.                              |

---

## Errores

| HTTP | `code`                       | Cuándo                                                                                                                                | Qué hacer                                                             |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 400  | `invalid_payload`            | JSON malformado, campo faltante o desconocido, los dos identificadores o ninguno, `motivo` fuera de rango. `errors[]` trae el `path`. | Corregí en origen.                                                    |
| 400  | `accion_invalida`            | `cancelar_orden` o `solicitar_devolucion` con `proforma_number`.                                                                      | La venta mayorista solo admite `cancelar_pedido`.                     |
| 401  | `unauthorized`               | Firma ausente o inválida, timestamp fuera de ventana.                                                                                 | No reintentes igual, revisá firma, timestamp y secret.                |
| 404  | `not_found`                  | El número no existe.                                                                                                                  | Revisá el identificador.                                              |
| 409  | `orden_gocuotas_desconocida` | La orden todavía no tiene vinculada su orden de GOcuotas. Pasa justo después del checkout.                                            | Reintentá en unos minutos.                                            |
| 409  | `orden_fuera_del_ecommerce`  | La orden no es del ecommerce de GOcelular y no se puede reembolsar por esta API. No se canceló nada.                                  | Usá `cancelar_pedido` si solo hay que frenar el envío.                |
| 409  | `orden_con_equipo`           | La orden ya tiene un equipo asignado y su pedido no salió del depósito (o no tiene pedido en el depósito).                            | No se reembolsa. Un operador desvincula el equipo primero.            |
| 409  | `cancelacion_no_confirmada`  | El pedido figura cancelado pero sin confirmación de Andreani.                                                                         | No se reembolsa. Lo resuelve un operador.                             |
| 409  | `reembolso_previo`           | Ya hay un reembolso `incierto`, `descartado` o `error` para la orden.                                                                 | Reabrirlo es manual. Avisanos con el `request_id`.                    |
| 409  | `sin_entrega`                | Solo `solicitar_devolucion`. El envío de la orden no figura entregado.                                                                | Si el paquete no llegó, usá `cancelar_pedido` o `cancelar_orden`.     |
| 409  | `sin_direccion`              | Solo `solicitar_devolucion`. La orden no tiene dirección de Andreani.                                                                 | Lo resuelve un operador.                                              |
| 409  | `error`                      | Solo `solicitar_devolucion`. No se pudo crear la devolución (alta en curso o Andreani no respondió). `message` trae el detalle.       | Reintentá con backoff.                                                |
| 409  | `no_habilitado`              | Solo `solicitar_devolucion`. La devolución por API todavía no está habilitada de nuestro lado. No se agendó ningún retiro.            | No reintentes. Te avisamos cuando esté activa.                        |
| 413  | `payload_too_large`          | Body mayor a 1 MB.                                                                                                                    | Achicá el payload.                                                    |
| 500  | `internal_error`             | Error nuestro.                                                                                                                        | Reintentá con backoff.                                                |
| 503  | `integration_disabled`       | Solo `apply`. La cancelación está apagada de nuestro lado.                                                                            | Esperado en la fase de integración. Reintentá con backoff.            |
| 503  | `refund_disabled`            | Solo `apply` con `cancelar_orden`. El reembolso está apagado de nuestro lado.                                                         | Podés usar `cancelar_pedido`. Reintentá `cancelar_orden` con backoff. |

Los 409 llevan además `message` con el detalle y, si corresponde, el bloque `reembolso`. `retryable` es `true` solo en 5xx, 503 y los 409 `orden_gocuotas_desconocida` y `error`. El 409 `no_habilitado` no es reintentable. Con el interruptor apagado no se escribe nada. `solicitar_devolucion` depende solo del interruptor de cancelación.

### Envelope de error

```json
{
  "result": "rejected",
  "code": "orden_con_equipo",
  "request_id": "uuid",
  "retryable": false,
  "message": "La orden tiene un equipo asignado"
}
```

---

## Retry policy

| Situación                                            | Acción                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Timeout de red en un `apply`                         | Reintentá el mismo payload con timestamp y firma nuevos. Es seguro.                                                                 |
| `resultado` `vivo` o `sin_pedido_wh`                 | Reintentá con backoff.                                                                                                              |
| `500`, `503`                                         | Reintentá con backoff.                                                                                                              |
| `cancelacion_pedida` o `cancelacion_pedida_por_mail` | No reintentes el `apply`, consultá el `GET`.                                                                                        |
| `rescate_pedido` o `rescate_confirmado`              | No reintentes el `apply`, consultá el `GET`.                                                                                        |
| `no_cancelable_entregado`                            | No reintentes la cancelación. Pedí `solicitar_devolucion`.                                                                          |
| `401`, `400`, `404`, `409`                           | No reintentes igual, salvo un 409 con `retryable: true` (`orden_gocuotas_desconocida` o `error`), que se reintenta en unos minutos. |

Backoff sugerido de 2s, 4s y 8s, con un máximo de 3 reintentos.

---

## Si algo falla

Registramos cada request que llega a este endpoint (y a compras, venta mayorista, precios y novedades), con su body, nuestra respuesta y, en un 401, el motivo exacto del rechazo de la firma. Si algo te da error o un resultado que no esperás, mandanos el `request_id` de la respuesta. Las respuestas sin body JSON, como el PDF de la etiqueta, lo llevan en el header `X-Request-Id`.

## Probar tu integración

1. `GET` de una orden de prueba para validar la firma.
2. `preview` de `cancelar_pedido`, de `cancelar_orden` y de `solicitar_devolucion` para ver qué haríamos.
3. Avisanos y prendemos los interruptores de a uno, primero la cancelación, después el reembolso.

Contacto en #gocelular-integraciones.
