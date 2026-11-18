# Cosechas — análisis A/B de cohortes custom en Finanzas

**Fecha:** 2026-11-18 · **Pedido por:** Emiliano · **Estado:** borrador para aprobación

## Intención y porqué

Emiliano toma decisiones de negocio que afectan el comportamiento de pago (ej.: subió el
downpayment por usuario unos días y las ventas cayeron; después lo revirtió pero activó el
seguro incluido). Hoy Vintage y Payment Defaults solo agrupan por mes calendario, así que
una decisión que duró 10 días queda diluida dentro del mes. Necesita armar **cosechas a
medida** —grupos de ventas definidos por él, con nombre— y compararlas entre sí para hacer
A/B testing de esas decisiones: "¿la cosecha con DP alto paga mejor y cuánto?".

Las cosechas van a tener edades distintas (no arrancan el mismo día), así que la
comparación tiene que ser honesta respecto de la madurez: métricas que solo computan lo ya
vencido (PD) como indicador temprano, y una curva de evolución por edad para comparar "a
los mismos días de vida".

## Metas

1. Pestaña nueva **"Cosechas"** en `/finanzas` (FinanzasTabs), al lado de Vintage y
   Payment Defaults.
2. Crear una cosecha con: **nombre** libre, **rango de fechas de venta** (originación),
   y filtros opcionales —cada uno con default "todos"—:
   - **Canal**: Total / Venta Propia / Venta de Terceros, y con Terceros los desplegables
     Merchant → Store (igual que la barra de filtros actual de PD/Vintage).
   - **Segmento**: letra A–D y/o número 1–4 (igual que hoy, vía `segmentos_clientes`).
   - **Bloqueo**: Knox / Motosafe / DLC (igual que hoy, por marca del device).
   - **Estado Trustonic**: uno o varios de `active`, `locked`, `ready_for_use`, `idle`,
     `released`, `returned` (estado **actual** del equipo al momento de armar la cosecha).
   - **Modelos**: uno o varios modelos, elegidos sobre nombres normalizados
     (`normalizarModelo` ya unifica las variantes de `devices.model`).
   - **Límite de ventas** (opcional, elegido libremente — ej. 500 o 1000): si el
     rango+filtros devuelve más órdenes que el límite, se toman las **primeras N en orden
     cronológico de venta**. Sirve para que las cosechas comparadas tengan tamaño parecido.
     Además del límite elegido, siempre se muestra **cuántas órdenes había disponibles en
     total** con esos filtros: en la previsualización antes de guardar y persistido en la
     cosecha (ej. "500 de 2.340 disponibles"), para dimensionar cuán representativa es la
     muestra.
3. Por cada cosecha, mostrar:
   - **Vintage**: la misma clasificación de buckets que la pestaña Vintage (cobrada en
     término, por vencer, mora 1-29/30-59/60-89, incobrable 90+, recuperos), pero con
     **una fila/barra por cosecha** en vez de por mes de originación.
   - **Payment Defaults**: PD Hard y PD30 **por número de cuota** (C1, C2, …), lado a lado
     entre cosechas. Es el indicador temprano: solo computa cuotas ya vencidas, así que es
     comparable entre cosechas de edades distintas.
   - **Madurez**: % del monto todavía por vencer, **fecha de fin de ciclo** = vencimiento
     de la última cuota + 90 días (ventana de incobrable, `DIAS_INCOBRABLE`), días
     restantes hasta esa fecha, y edad de la cosecha.
   - **Curva de evolución por edad**: una línea por cosecha; eje X = días desde la venta
     de cada orden (edad), eje Y = % del monto vencido a esa edad que seguía impago.
     Reconstruible históricamente porque tenemos `installment_due_at` y
     `installment_collected_at`: a edad *d*, una cuota está vencida si
     `due ≤ venta + d` y cobrada si `collected ≤ venta + d`. Cada línea termina en la
     edad actual de su cosecha. Es el gráfico que compara "a igual edad".
4. Gestión: lista de cosechas guardadas, elegir cuáles comparar (checkboxes), borrar.

## No-metas

- Significancia estadística automática (p-values, intervalos). Emiliano lee los números.
- Cosechas que se re-arman solas con el tiempo o cosechas periódicas automáticas.
- Editar la membresía de una cosecha a mano (agregar/sacar órdenes individuales).
- DPD por cosecha (si hace falta, iteración futura).

## Anti-metas

- **No alargar la carga de `/finanzas`**: la página ya tarda ~27s con maxDuration=60. Nada
  de Cosechas entra al `Promise.all` de `page.tsx`; solo la lista de definiciones (query
  barata a Supabase). Las métricas se piden on-demand por server action al abrir la
  pestaña/elegir cosechas, con cache en memoria del cliente (patrón `useIndicadoresFiltro`).
- **Nunca tocar la base directa de GOcuotas**: todo sale de la réplica de GOcelular
  (`gocuotas_*`, `devices`) y de Supabase. Sin NOT IN sobre la base directa (regla crítica
  del 17/9).
- Que dos cosechas con los mismos parámetros den resultados distintos según cuándo se
  miren: por eso la membresía se congela (ver decisión 1).

## Decisiones tomadas

### Con Emiliano
- Cosechas también de terceros (merchant/store) y por segmento, tal cual los filtros de hoy.
- Incluir Payment Defaults además del vintage, como indicador temprano.
- Curva de evolución a igual edad: aprobada la propuesta.
- El límite de ventas corta a las primeras N del rango ("yo te diría fechas y vos entre
  esas fechas y con otros atributos me buscás las ventas hasta un límite establecido").

### Mías (el builder las hereda, Emiliano puede vetarlas)
1. **Membresía congelada al crear.** Al guardar la cosecha se resuelven los filtros UNA
   vez y se persisten los `order_id`. Razones: (a) un A/B test necesita que el grupo no
   cambie bajo los pies; (b) el estado Trustonic es mutable (un equipo `active` hoy puede
   estar `locked` mañana) — si la membresía fuera dinámica, la cosecha "equipos locked"
   cambiaría de integrantes cada día. Para "re-armar" se borra y se crea de nuevo.
2. **Originación = `order_created_at`** (fecha de venta, igual que Vintage y que la regla
   de share por venta; NO `created_at` de la réplica). Rango de fechas en hora ART,
   inclusive ambos extremos.
3. **Universo = órdenes entregadas y no descartadas** (`order_delivered_at IS NOT NULL
   AND order_discarded_at IS NULL`), igual que PD/Vintage. El límite N y el conteo de
   "celulares vendidos" cuentan órdenes.
4. **Filtro por modelos**: el picker muestra modelos normalizados (con
   `normalizarModelo` de `lib/inventario-indicadores.ts`) y al resolver la cosecha se
   expande a los strings crudos de `devices.model` que normalizan a lo elegido; el match
   orden↔device usa el patrón `MIN(...)` por orden ya establecido en `lib/bloqueo.ts`
   para evitar fan-out. Órdenes sin device quedan fuera solo si hay filtro de modelo,
   trustonic o bloqueo (igual que hoy con bloqueo, ~1%).
5. **Filtro Trustonic**: multi-select sobre el estado actual; con más de un device por
   orden, la orden entra si **algún** device matchea (consistente con "equipos de la
   cosecha").
6. **Persistencia en Supabase** (proyecto admin), tabla `cosechas`:
   `id uuid PK, nombre text, fecha_desde date, fecha_hasta date, filtros jsonb,
   limite int null, order_ids text[], cant_ordenes int, cant_disponibles int,
   monto_total numeric, created_at timestamptz` (`cant_disponibles` = total de órdenes
   que matcheaban los filtros al crear, sin aplicar el límite). Sin RLS (patrón del repo; las server actions chequean
   sesión). Script SQL en `scripts/`.
7. **Las métricas se calculan al vuelo** contra la réplica con
   `o.order_id::text IN (<order_ids congelados>)`, reutilizando la clasificación de
   `fetchVintageAnalysis` y `fetchPDIndicadores` refactorizadas para aceptar una lista de
   order_ids (listas de cientos/miles de ids: IN está bien a esta escala). Los
   contracargos y transición 30+ siguen entrando al bucket incobrable como hoy.
8. **Curva de evolución**: puntos cada 7 días de edad; la métrica es
   `monto impago a edad d / monto vencido a edad d` (%), calculada en SQL o en una
   función pura testeada (preferencia del repo: lógica pura en `lib/cosechas.ts` con
   tests, fetch fino en actions).
9. **Permisos**: subitem nuevo `cosechas` bajo Finanzas en `lib/permisos-catalogo.ts`
   (el test de cobertura lo exige). Ver = ver la pestaña; crear/borrar cosechas con guard
   server-side `requierePermiso` (patrón de las 17 actions de Finanzas).
10. **Corte honesto de la curva de evolución.** Una cosecha abarca un rango de fechas,
    así que a edad *d* las órdenes vendidas hace menos de *d* días todavía no tienen dato.
    La línea es **sólida hasta la edad de la orden más joven** (todos los puntos
    calculados sobre la membresía completa — comparación sin sesgo) y sigue **punteada**
    sobre el subconjunto que ya alcanzó esa edad, cortando cuando el subconjunto baja del
    50% de las órdenes (tooltip indica sobre qué % se calculó). La "edad de la cosecha"
    del bloque Madurez es la de la orden más joven (la que limita la parte sólida); se
    muestra también la fecha de la primera y última venta.
11. **Órdenes anuladas después de congelar.** Las queries de métricas conservan el guard
    `order_discarded_at IS NULL`: una orden anulada (arrepentimiento/refund) deja de
    computar — no es mora, es una venta deshecha. Pero la divergencia se **muestra**: si
    al calcular hay menos órdenes que `cant_ordenes` congeladas, la cosecha lleva un badge
    "N órdenes anuladas desde la creación". Así, si una decisión genera más
    arrepentimientos, Emiliano lo ve como señal aparte en vez de que se esconda.
12. **Consistencia de contracargos y cuotas descartadas en la curva.** Para que las tres
    vistas de una cosecha cuenten la misma historia: en la curva de evolución las cuotas
    de órdenes con contracargo se tratan como **impagas** (aunque tengan `collected_at` —
    la plata se devolvió), igual que en el bucket incobrable del vintage; y las cuotas con
    `installment_discarded_at` (refinanciadas/descartadas) salen del denominador, como en
    PD.
13. **Tope de tamaño y queries parametrizadas.** El form exige que la cosecha resuelva a
    **≤ 10.000 órdenes** (si el rango+filtros da más, hay que poner límite o achicar el
    rango — la previsualización lo avisa). Las queries de métricas usan
    `o.order_id::text = ANY($1)` parametrizado, nunca interpolación de strings, para no
    repetir los incidentes de forma de query de esta página.
14. **"Monto" = suma de cuotas (`installment_amount`) en todos lados** — preview,
    `monto_total` congelado, denominadores de Madurez y curva — por consistencia con
    Vintage/PD. En la UI se etiqueta **"Monto financiado"** para que no se lea como ticket
    de venta.
15. **UI estilo Finanzas**: FinanzasTabs, tablas compactas, botones `bg-gray-900`,
    checkboxes para elegir qué cosechas comparar, colores de buckets idénticos a
    VintageTab para lectura inmediata. El form de creación muestra, antes de guardar,
    una **previsualización**: cuántas órdenes y qué monto matchean los filtros (y cuántas
    quedarían tras el límite), para que Emiliano ajuste fechas/límite antes de congelar.
16. **Manual operativo**: la pestaña nueva cambia `/finanzas` → si Finanzas tiene manual
    operativo vigente, se regenera en el mismo trabajo (regla de manuales).

## Qué queda al builder

- Diseño exacto del form (orden de los campos, validaciones) respetando la decisión 15.
- Si la curva de evolución se calcula en SQL o en JS sobre las cuotas crudas (lo que sea
  más simple de testear; la lógica de clasificación va en función pura con tests).
- Layout de la comparación (tabla vintage arriba, PD al medio, curva abajo, o pestañas
  internas) — mientras todo sea visible sin fricción.
- Cache cliente y estados de carga (patrón `useIndicadoresFiltro` como referencia).
- Nombres de archivos/components (sugerencia: `CosechasTab.tsx`, `lib/cosechas.ts`,
  `lib/actions/cosechas.ts`, `scripts/cosechas.sql`).
