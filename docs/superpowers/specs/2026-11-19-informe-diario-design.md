# Informe diario por mail (6 AM) — diseño

**Fecha:** 2026-11-19 · **Pedido por:** Emiliano · **Estado:** borrador para aprobación

## Intención y porqué

Emiliano quiere arrancar cada día con un mail único y claro que le resuma el negocio sin
entrar a la app: qué se vendió ayer y cómo está el stock de eso, cómo viene el mes contra
la proyección, seguros, caja de la semana, indicadores de riesgo y su agenda. Un mail por
día, a las 6:00 AM (hora argentina), a su propia casilla.

## Metas

Un cron diario que arma y envía UN mail HTML con estos bloques, en este orden:

1. **Ventas de ayer** (día calendario ART anterior, por `order_created_at`):
   - Venta propia y venta de terceros: cantidad de órdenes y monto, cada una.
   - Tabla de modelos vendidos ayer (nombre normalizado, unidades) con dos columnas al
     lado de cada modelo:
     - **Días de stock**: cobertura proyectada del modelo (stock + tránsito + pedidos,
       sobre venta diaria 30d — la misma `coberturaProyectada` de Inventario). Pintar
       en el HTML con la misma semántica: rojo ≤10d, ámbar <14d.
     - **A comprar**: unidades a comprar del modelo según el Forecast de Compras
       (lib/forecast-compras: demanda proyectada − pipeline). 0 si no hay que comprar;
       "—" si el modelo no está en el forecast (ej. accesorios fuera de alcance).
2. **Forecast de ventas** (mes en curso):
   - Proyección congelada del run vigente (ambos métodos, híbrido y gocuotas) vs real
     acumulado del mes, con la dif % contra la proyección prorrateada por días
     transcurridos (misma matemática que /canales/proyeccion: `realParcial` +
     `fraccionMesTranscurrida`).
   - **Mejor estimación de cierre**: proyección simple por run-rate = real acumulado ÷
     días transcurridos × días del mes, comparada contra ambos métodos; veredicto en una
     línea: "se encamina a cumplir (est. X u. vs proy. Y)" si el run-rate ≥ 97% de la
     proyección, "va justo" entre 90–97%, "no llega" debajo. Es una regla simple y
     transparente, no un modelo nuevo.
3. **Seguros**:
   - Pólizas emitidas ayer (`seguros_certificados.created_at` en el día ART de ayer).
   - Siniestros de ayer (`fecha_siniestro` = ayer).
4. **Finanzas**:
   - **Caja próximos 7 días**: saldo disponible proyectado desde hoy hasta hoy+7, día
     por día (la misma serie diaria `cash_balance` del flujo de fondos Total que grafica
     CashBalanceChart). Resaltar el mínimo de la semana; si algún día da negativo,
     marcarlo en rojo.
   - **PD cuotas 2, 3 y 4**: tabla cuota × mes de originación con PD Hard y PD30, sobre
     los **últimos 3 meses de originación con la tabla completa** — un mes califica si
     TODAS las celdas tienen denominador > 0 (para PD30, la cuota 4 de ese mes ya venció
     hace 30+ días). Canal total. Así la tabla nunca trae celdas vacías/engañosas
     (decisión de Emiliano 19/11).
   - **Incobrabilidad de meses cerrados**: por mes de originación, % Incobrable 90+ del
     Vintage (misma clasificación de la pestaña, contracargos y transición incluidos),
     solo para **cohortes maduras**: meses cuya última cuota venció hace 90+ días.
     Mostrar los últimos 6 meses maduros.
5. **Depósito / warehouse** (agregado por Emiliano 19/11):
   - **Expedidos ayer**: pedidos `andreani_wh_pedidos` que pasaron a `expedido` ayer
     (por `sent_at`/`updated_at` del día ART anterior).
   - **Foto actual de la cola**: cuántos hay ahora en `picking`, `sent` (mandados al
     depósito sin expedir), `queued` y `requires_attention` (estos últimos en rojo:
     requieren acción).
   - **Demorados**: las alertas de demora que ya calcula la app (fetchAlertasEnvios /
     fetchDemorasEntrega): pedidos pagos sin expedir fuera del SLA y envíos sin
     movimiento — cantidad y los 5 peores con días de demora.
   - **Arrepentimientos**: pedidos de arrepentimiento/devolución abiertos (misma fuente
     que la pestaña Arrepentimientos de /compras/envios) y cuántos entraron ayer.
   - **Pendientes de regreso**: el contador de la pestaña Pendiente de regreso (envíos
     que Andreani marcó no entregado y aún no volvieron al stock).
6. **Agenda de hoy**:
   - ToDos pendientes de /notas (`app_todos` en flujo_config): los vencidos y los de hoy,
     con los urgentes primero.
   - Eventos de HOY del Google Calendar ya conectado (misma integración de /api/calendar,
     tokens en flujo_config `google_calendar_tokens`).

## No-metas

- Nada de links profundos con auth ni gráficos embebidos: texto y tablas HTML simples.
  (Un link general a https://goabl.app al pie alcanza.)
- No es configurable por UI (destinatario/hora se cambian por env/vercel.json).
- No incluye GOmarket (commerce_*) en v1 — ventas propias/terceros de celulares como en
  el Dashboard.
- No reemplaza las alertas existentes; es un resumen.

## Anti-metas

- **La ventana de backup de GOcuotas NO puede matar el mail.** A las 6 AM la base
  DIRECTA de GOcuotas suele estar en su ventana de backup (auth failed hasta ~9 AM) y el
  bloque de caja depende de ella (income del flujo). Cada bloque se arma con su propio
  try/catch: si un bloque falla, el mail sale igual con ese bloque reemplazado por una
  nota ("Caja: no disponible por la ventana de backup de GOcuotas — ver /finanzas más
  tarde"). El mail NUNCA deja de salir por un bloque caído.
- No recalcular lógica que ya existe: reutilizar los fetchers de Dashboard/Inventario/
  Proyección/Forecast/Seguros/Flujo/PD/Vintage. Lo nuevo es solo el ensamblado + HTML.
- No tocar la base directa con queries nuevas; solo vía los fetchers existentes.

## Decisiones tomadas

### Con Emiliano (19/11)
- Incobrabilidad = Incobrable 90+ del Vintage sobre cohortes maduras.
- Agenda = Google Calendar + ToDos.
- PD = tabla cuota 2/3/4 × mes, PD Hard y PD30, retrocediendo los meses necesarios para
  que toda la tabla tenga datos.

### Mías (vetables)
1. **Destinatario**: emiliano.canova@gocuotas.com, override con env `INFORME_MAIL_PARA`
   (mismo patrón que BACKLOG_MAIL_PARA). Remitente: el SMTP ya configurado en
   lib/mailer.ts (gocelulares@).
2. **Cron**: `/api/cron/informe-diario`, schedule `0 9 * * *` UTC = 6:00 ART, protegido
   con Bearer `CRON_SECRET` como los demás; `maxDuration = 300`. Parámetro `?fecha=` para
   re-generar el informe de un día puntual y `?dry=1` que devuelve el HTML sin enviarlo
   (para testear).
3. **"Ventas de ayer" por canal** usa la MISMA fuente que la tarjeta Ventas del día del
   Dashboard (propia = client_ids propios, terceros = el resto; órdenes creadas ese día).
   Modelos: propia por `store_orders.product_name` (split de marca/modelo como el
   Dashboard), terceros por `devices.model`, ambos normalizados con `normalizarModelo`
   para cruzar contra inventario/forecast.
4. **Idempotencia suave**: el cron registra en flujo_config `informe_diario_ultimo` la
   fecha enviada; si ya se envió hoy y no viene `?force=1`, no re-envía (protege de
   re-ejecuciones del cron).
5. **Asunto**: `GOcelular360 — Informe diario <fecha>` con la fecha ART del día.
6. **Registro**: guardar el HTML enviado en flujo_config NO (pesa); solo log del cron.
   Si Emiliano quiere historial, lo vemos después.
7. **Denominadores del PD** (hallazgo del builder check): `fetchPDIndicadores` hoy solo
   devuelve porcentajes y un 0% puede significar "sin cuotas vencidas aún" o "0% real de
   mora" — indistinguibles. Para aplicar la regla de "toda la tabla con datos" el fetcher
   se extiende de forma ADITIVA: las filas devuelven también `den_hard` y `den_30`
   (montos del denominador). Nada del comportamiento existente cambia; los consumidores
   actuales ignoran los campos nuevos.
8. **"A comprar" por modelo**: total a comprar del modelo sobre el horizonte estándar del
   Forecast de Compras (resto del mes + meses proyectados del run congelado), mostrado
   como **rango entre ambos métodos** ("12–18 u.") — consistente con la regla de Emiliano
   de mirar híbrido y gocuotas como piso/techo al comprar. Si coinciden, un solo número.
9. **Siniestros de ayer = denuncias INGRESADAS ayer** (`seguros_siniestros.created_at`
   del día ART anterior), no `fecha_siniestro` (esa es la fecha del robo y se carga al
   resolver — filtraría casi siempre vacío, hallazgo del builder check).
10. **Semántica de `?fecha=`**: desplaza SOLO los bloques "de ayer" (ventas, seguros,
    depósito-expedidos/entradas). Los bloques de estado vivo (stock, forecast del mes,
    caja, cola del depósito, agenda) siempre reflejan el momento de la corrida — no hay
    reconstrucción histórica. Es una conveniencia de prueba/backfill, no un replay.
11. **Estética = look & feel de la app** (pedido explícito de Emiliano 19/11): HTML con
    estilos inline (los clientes de mail no cargan CSS externo) que replique el estilo
    Finanzas: tarjetas blancas con borde `#e5e7eb` y esquinas redondeadas, headers de
    tabla grises (`#f9fafb`, texto `#4b5563`), tablas compactas (12px), títulos de
    sección en negrita gris oscuro, acentos `#111827` (gray-900), y los colores
    semánticos exactos de la app: verde `#16a34a`, ámbar `#d97706`, rojo `#dc2626`,
    magenta `#db2777` para el header del mail. Fuente system-ui/Arial fallback.

## Qué queda al builder

- Elegir qué fetchers exactos reutilizar para cada bloque (están todos; mapearlos).
- La función pura `armarInformeDiario(datos) → html` va en lib/informe-diario.ts con
  tests (bloques con datos, bloques caídos con fallback, selección de meses de la tabla
  PD, selección de cohortes maduras, regla del veredicto de forecast).
- Orden exacto de fetches y qué puede ir en paralelo sin saturar pools (réplica max 5,
  directa max 3 — el bloque de caja va solo y con catch).
- Formato fino del HTML (dentro de la decisión 7).
