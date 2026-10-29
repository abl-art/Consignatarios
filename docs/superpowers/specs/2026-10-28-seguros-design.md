# Seguros por Robo — Diseño

**Fecha:** 2026-10-28
**Estado:** borrador para aprobación de Emiliano

## Intención y por qué

GOcelular va a vender los celulares de la tienda propia con **seguro de robo incluido**. La aseguradora cobra una prima mensual del **2% (IVA incluido) de la suma asegurada** de cada certificado vigente y no anulado, y pide recibir mes a mes un Excel con 16 columnas (plantilla `Seguros por Robo.xlsx`). El beneficiario del seguro es GOcelular (cubre la reposición del equipo robado); el cliente lo percibe como beneficio incluido en el precio.

La página nueva **/seguros** (sección propia, tarjeta en el lugar que defina el builder dentro de la navegación actual) administra todo el ciclo: emisión automática de certificados, export para el broker, control de la prima mensual, resultado del negocio y gestión de siniestros con un formulario público para que el cliente cargue la denuncia.

El negocio cierra así (decidido por Emiliano):

- **Ingreso:** 3% mensual sobre el costo sin IVA del equipo, embebido en el PVP (2,2% cubre la prima real + ~0,8-1% de profit). El PVP no cambia de fórmula: Emiliano sube el múltiplo de Lista de Precios de 2,07 a **2,34** (recomendado; 2,36 si quiere el 1%/mes garantizado). Ese cambio lo hace él a mano en Lista de Precios — **no es parte de este desarrollo**.
- **Costo:** prima = 2% mensual (IVA inc.) × suma asegurada, por certificado vigente no anulado.
- Los certificados anulados antes de los 9 meses dejan de devengar prima → el profit real queda algo arriba del nominal.

## Metas

1. Emisión automática de certificados correlativos para toda venta elegible mientras el seguro esté activo.
2. Export Excel con **exactamente** las 16 columnas de la aseguradora, descargable para mandarle al broker.
3. Pestaña Prima Mensual: control de lo que factura la aseguradora mes a mes.
4. Pestaña Resultado: ingreso devengado vs prima pagada + siniestralidad informativa.
5. Circuito de siniestros: formulario público (cliente carga DNI + denuncia) → mail a Yami → gestión y resolución en backoffice.

## No-metas (versión 1)

- **No** se automatiza el voucher/saldo a favor del cliente: resolución positiva la gestiona Yami a mano (manda link de pago por la diferencia si corresponde). La app solo registra la resolución y el monto reconocido.
- **No** se toca la fórmula de Lista de Precios ni el simulador. El % de seguro es un parámetro de /seguros, no entra en el cálculo del PVP.
- **No** hay integración API con la aseguradora: el intercambio es el Excel.
- **No** entran accesorios, tablets, kits, ventas de terceros ni mayoristas. Solo celulares de la tienda propia.
- **No** se notifica al cliente por mail/WhatsApp desde la app (ni al emitir certificado ni al resolver siniestro).

## Anti-metas

- Emitir certificados de ventas anteriores a la activación del interruptor (la aseguradora solo cubre lo informado desde el alta).
- Seguir devengando prima de órdenes descartadas o con contracargo (en fraudes no se paga más seguro).
- Que el formulario público acepte denuncias de DNIs sin certificado vigente ("denuncias sin sentido").
- Exponer datos internos (costos, márgenes, otras ventas) en el Excel del broker o en el formulario público.

## Decisiones tomadas (por Emiliano, salvo marcadas como del builder/Claude)

### Universo y emisión

- **Interruptor maestro** activable/desactivable cuando él quiera. Activo ⇒ entran **todas las ventas desde ese momento en adelante**. Al desactivar, no se emiten certificados nuevos; los existentes siguen su ciclo.
- Elegible: venta de **celular** de la **tienda propia** que recibe **IMEI asignado**. El gatillo es la asignación del IMEI (`order_device_assignments.linked_at`, state `ready_for_control`), no el pago: sin IMEI no hay qué asegurar.
- **N° de certificado correlativo desde 1**, sin huecos, asignado en orden de emisión.
- **Suma asegurada = costo de lista sin IVA × 1,10, congelada al momento de la emisión** (no se recalcula si la lista cambia). Costo de lista = la misma regla de la app (`elegirCosto` de `lib/lista-precios.ts`: proveedor preferido por marca, fallback más barato).
  - **Fallback si el modelo no tiene costo de lista al emitir** (modelo discontinuado o nombre que no matchea — call de Claude): usar el costo real de la unidad asignada (`inventory_items` del IMEI, que es literalmente el costo de reposición); si tampoco existe, el certificado queda en estado `pendiente de emisión` visible en la página con alerta — nunca se saltea la venta en silencio.
  - Razón del costo sin IVA (validada con Emiliano): la pérdida real ante robo es reponer el equipo; el IVA de la reposición se recupera como crédito fiscal. Asegurar PVP sería sobre-asegurar y pagar prima de más. El ×1,10 da margen sobre el costo de reposición.
- **Vigencia: 9 meses fijos** desde la fecha de la orden, para todos (aunque la venta sea en 6 cuotas).

### Ciclo de vida del certificado

- **Anulación (columna Fecha Anula, deja de devengar prima):**
  - Orden descartada/anulada (`gocuotas_orders.status = discarded`).
  - Orden con **contracargo** (misma detección que ya usa Finanzas: `fetchOrderIdsConContracargo`). En fraudes no se sigue abonando el seguro.
- **Siniestro (robo efectivo): cierra el certificado con campo propio `Fecha Siniestro`**, separado de Fecha Anula (decidido por Emiliano) — cubre un solo evento por certificado y alimenta la tasa de siniestralidad. La Fecha Siniestro **sí se exporta al Excel del broker** como columna adicional; desde esa fecha el certificado deja de devengar prima (igual que una anulación). Qué fecha va: la **fecha del robo declarada en la denuncia**, cargada/editable por Yami al resolver positivo (call de Claude).
- **IMEI dinámico (decidido por Emiliano):** el IMEI asegurado es **el que esté vinculado a la orden de GOcuotas en cada momento**. Si hubo cambio por garantía, el sync **actualiza el IMEI en el certificado** (no se anula ni se re-emite; la suma asegurada congelada no cambia). En ventas propias nunca se desvincula un IMEI sin reemplazo, así que no hay estado intermedio que contemplar.
- **Mora:** la mora del cliente **suspende la cobertura hacia él pero NO anula el certificado** (el beneficiario es GOcelular; se sigue pagando la prima y si se pone al día recupera cobertura). Definición de mora: **al menos una cuota vencida e impaga en GOcuotas, sin días de gracia** — apenas la cuota del celular está en mora, el seguro está en mora. Es un estado calculado en vivo (desde `gocuotas_installments`), no una columna persistida.

### Export para el broker

- Botón **Descargar Excel** con las 16 columnas de la plantilla (encabezados idénticos, incluidos espacios) + 3 columnas que pidió Emiliano (17-19), y nada más:

| # | Columna | Fuente |
|---|---|---|
| 1 | `N° certificado ` | correlativo propio |
| 2 | `Tipo ` | constante `DNI` |
| 3 | `Nº Documento` | `store_orders.customer_dni` |
| 4 | `Cliente (Apellido y Nombre)` | `store_orders.customer_name` (o last+first si están partidos) |
| 5 | `Domicilio` | envío Andreani: `shipping_street + shipping_number (+ piso/depto)`; si retiro en sucursal, domicilio de la sucursal (`shipping_branch_address`) |
| 6 | `Codigo Postal` | `store_orders.shipping_postal_code` |
| 7 | `Localidad` | `store_orders.shipping_city` |
| 8 | `Articulo (Descripcion, marca, modelo)` | `store_orders.product_name` |
| 9 | `IMEI` | `order_device_assignments.imei` — **el vigente en la orden** (se actualiza ante cambio por garantía) |
| 10 | `SUMA ASEGURADA` | congelada en la emisión (costo sin IVA × 1,10) |
| 11 | `Fecha Factura` | `invoices.authorized_at` de la Factura B |
| 12 | `Fecha Anula` | fecha de anulación (null si vigente) |
| 13 | `Inicio Vig` | fecha de la orden (`order_created_at` de la venta — NO el `created_at` de réplica) |
| 14 | `Fin Vig` | inicio + 9 meses |
| 15 | `Tipo de comprobante (fac A/B - NC A/B)` | `Factura B` |
| 16 | `Nº Factura` | `invoices.invoice_number` |
| 17 | `Fecha Siniestro` | fecha del robo si el certificado cerró por siniestro (columna nueva pedida por Emiliano, null si no) |
| 18 | `N° Orden GOcuotas` | `gocuotas_order_id` (columna nueva pedida por Emiliano — trazabilidad del IMEI dinámico) |
| 19 | `N° Pedido GOcelular` | `store_orders.order_number` (columna nueva pedida por Emiliano) |

- **Factura B (verificado en la réplica):** tabla `invoices` — type `factura_b`, preferir `invoice_scope='device'` (la factura del equipo, 19.3k filas), fallback `scope='order'`; match por `gocuotas_order_id` o `store_order_id`, status `authorized`. Si la factura aún no existe al emitir el certificado, las columnas 11/16 quedan vacías y se completan solas cuando aparece (el Excel se arma en vivo).
- El export incluye todos los certificados emitidos (vigentes y anulados — la aseguradora necesita ver la Fecha Anula). Filtro de mes opcional si el builder lo considera útil.

### Pestaña Prima Mensual (control interno)

- Mes a mes: suma asegurada vigente total (certificados activos ese mes, prorrateo NO — mes calendario completo: **regla simple v1, call de Claude**: un certificado devenga prima en cada mes calendario en que estuvo vigente al menos un día; si la aseguradora factura distinto, se ajusta al ver la primera factura) × 2% = prima esperada (IVA inc.).
- El % de prima es **configurable** (default 2) por si se renegocia. **Con fecha de vigencia** (call de Claude): un cambio de % aplica de un mes hacia adelante; los meses cerrados no se recalculan (si no, cambiar el 2% reescribiría el control histórico de facturación). Misma regla para el % de ingreso de la pestaña Resultado.

### Pestaña Resultado

- **Ingreso:** % mensual configurable (default **3%** sobre el costo sin IVA congelado) devengado por mes por certificado vigente. Es el componente de seguro embebido en el PVP.
- **Costo:** prima esperada del mes (de la pestaña Prima Mensual).
- **Resultado:** ingreso − prima, por mes y acumulado.
- **Siniestralidad (informativa, NO es costo):** certificados cerrados por robo ÷ emitidos, y opcionalmente $ reconocidos por la aseguradora vs prima pagada. Es el número que mira la aseguradora para renovar el 2% — herramienta de negociación.

### Circuito de siniestros

**Formulario público** (patrón link con token, como `/catalogo?token=...`):

- Lo hosteamos nosotros en goabl.app; el link (con token) se le pasa a Pedro para publicarlo en la tienda.
- El cliente ingresa su **DNI** → se valida en vivo contra certificados **vigentes** (no anulados, no cerrados, dentro de vigencia). Sin match ⇒ mensaje de rechazo claro (sin revelar datos). Con match ⇒ se le muestra su compra ("Moto G17 — comprado el X") para confirmar; si tiene más de un certificado vigente, elige cuál.
- Adjunta el **escaneo de la denuncia policial** (JPG/PNG/PDF, a nombre del titular de la compra). Archivo a **bucket privado** de Supabase (patrón CVs de reclutamiento).
- No se muestra el estado de mora al cliente en el formulario (call de Claude: la mora se gestiona en la conversación humana, no automatizada acá).
- Al enviarse: caso nuevo + **mail automático a Yami** (mismo mailer de Backlog Operaciones, `lib/mailer.ts`; override con env como allá).

**Backoffice — pestaña Siniestros en /seguros:**

- Lista de casos: datos del certificado (modelo, IMEI, vigencia, suma asegurada), link para ver la denuncia adjunta, y **estado al día / en mora del cliente calculado en vivo** (si está en mora, la cobertura está suspendida y el reclamo no corre hasta regularizar).
- Flujo de estados: `nuevo → en gestión → reclamado a aseguradora → resuelto positivo | resuelto negativo` (nombres exactos a criterio del builder; con patrón resolver/reabrir de 2 pasos como Siniestros Distribución).
- **Resolución positiva:** cierra el certificado con marca `siniestro` y registra **monto reconocido** + nota. El voucher/link de pago al cliente lo gestiona Yami fuera de la app (V1).
- Resolución negativa: el certificado sigue vigente (no hubo evento cubierto).

## Restricciones

- Stack y patrones del repo: Next.js 14 + Supabase + patrones existentes (lógica pura testeada en `lib/`, actions en `lib/actions/`, tablas con scripts SQL en `scripts/`, sin RLS salvo necesidad, API pública fuera del middleware con token como `/api/catalogo/tac`).
- La base directa de GOcuotas y la réplica tienen las reglas conocidas del repo (NUNCA NOT IN en la base directa; `order_created_at` ≠ `created_at` de réplica; pool limitado).
- Deploy: `npx vercel --prod` (git push no deploya).
- Los certificados son **persistidos** (tabla propia): el correlativo, la suma congelada y la Fecha Anula no pueden depender de recálculo en vivo. La emisión corre por sync (cron existente o al cargar la página — builder decide, con idempotencia: una venta = un certificado, único por orden).

## Qué queda al builder

- Modelo de datos exacto (sugerido: `seguros_config`, `seguros_certificados`, `seguros_siniestros` + bucket `denuncias-siniestros`).
- Mecanismo de emisión (cron vs on-load con lock) e idempotencia del correlativo.
- Detección de contracargo/discarded para poblar Fecha Anula (reusar lo de Finanzas).
- Nombres de estados, componentes de UI (seguir estilo Finanzas/Compras: FinanzasTabs, tarjetas de navegación estilo Compras), y ubicación de la tarjeta de entrada a /seguros.
- Librería del export (`xlsx` ya es dependencia).
- Manual operativo: la página nueva es operada por Yami ⇒ **lleva manual operativo** (regla del repo), a generar al final de la implementación.

## Etapa 2a — Cierres mensuales (agregado 29/10/2026, aprobado por Emiliano)

La tabla de certificados es dinámica (estados cambian); lo facturado por la aseguradora debe controlarse contra una **foto congelada** de cada mes, no contra el presente.

- **Tabla `seguros_cierres`**: una fila por mes cerrado — `mes` ('YYYY-MM', unique), `congelado_at`, `resumen` jsonb (certificados por estado, suma vigente, prima, ingreso, resultado del mes cerrado) y `filas_excel` jsonb (las filas del Excel del broker, 19 columnas, exactamente como estaban al congelar).
- **Cron el día 1 de cada mes** (`/api/cron/seguros-cierre`, patrón congelar-proyecciones con `?force=1` y `?mes=`): congela el mes anterior. Idempotente (unique mes). **No-op si no hay ningún certificado emitido** (seguro nunca prendido → sin ruido).
- **Pestaña "Cierres"** (5ta) en /seguros: tabla de cierres (mes, congelado el, certificados, suma vigente, prima, ingreso, resultado) + descarga del Excel histórico de cada cierre (`/api/seguros/export?cierre=YYYY-MM`, servido desde `filas_excel`) + botón "Congelar mes anterior" manual (confirmación 2 pasos) para el primer cierre o si el cron falló.
- Manual operativo: actualizar con la sección de cierres (regla del repo).

## Etapa 2b — Constancia de cobertura + mail al cliente (PENDIENTE de datos del broker)

Modelo recibido (Sancor Seguros, "Constancia de Cobertura — Robo Tecnología", a primera pérdida absoluta, mundo entero). Al emitirse cada certificado: generar PDF de la constancia (formato del modelo + **IMEI**, que el modelo no trae) y mandarlo por mail a `store_orders.customer_email` explicando el seguro y cómo actuar ante robo (denuncia policial **con el IMEI** + link al formulario). Si el mail falla, el certificado queda emitido y reintenta en el próximo sync. Agregar la aclaración del IMEI también al formulario público. **Bloqueado hasta que el broker responda**: número de póliza colectiva, significado del campo Ref (¿nuestro correlativo?), si la constancia replica el formato Sancor/productor tal cual o va con marca GOcelular, y si "ubicación del riesgo" = domicilio de envío del cliente.
