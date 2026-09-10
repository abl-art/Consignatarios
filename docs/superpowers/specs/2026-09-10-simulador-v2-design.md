# Simulador financiero v2 — Finanzas → Simulación / Productos

**Fecha:** 2026-09-10
**Estado:** diseño aprobado por Emiliano en sesión, pendiente de plan de implementación

## Premisa de negocio

Cada producto vendido es solo el vehículo para originar un crédito. No se vende de
contado ni en un pago: la mirada es 100% financiera. El simulador debe responder,
con datos reales del negocio, la pregunta central de pricing:

> Si quiero un resultado neto de mínimo 15% de cada operación (sobre order amount,
> restando TODO: costo, operativos, impuestos, incobrabilidad y fondeo), ¿qué
> múltiplo tengo que aplicar al costo sin IVA (venta propia) o qué tasa de
> descuento tengo que cobrar al comercio (terceros)?

## Decisiones tomadas (no reabrir)

1. **Una palanca por modalidad.** Venta propia: múltiplo sobre costo sin IVA
   (PVP final al cliente = costo sin IVA × múltiplo, N cuotas iguales, sin interés
   explícito — como opera la tienda hoy). Terceros: tasa de descuento al comercio.
2. **Objetivo del solver:** resultado neto final ≥ objetivo% × order amount
   (default 15%, editable). El resultado neto incluye costo de fondeo e
   incobrabilidad (más exigente que un EBITDA contable).
3. **Retorno sobre capital inmovilizado: solo indicador de salida**, no es
   restricción del solver.
4. **IVA como flujo real de caja** (detalle abajo).
5. **Se elimina el modo estocástico** por completo. Todo determinístico con datos
   reales; la incertidumbre se lee del vintage, no de una campana inventada.
6. **Se elimina consignatarios** como modalidad (canal muerto desde ago 2026).
7. **Incobrabilidad: % único editable** precargado desde el vintage real del canal,
   con panel de datos reales visible al lado. Curva por cuota: fuera de alcance v2.
8. **Los productos guardados v1 se borran** (Emiliano no los va a usar). Sin
   compatibilidad legacy.
9. **Anticipo (DP) default = 100/cuotas** (con 9 cuotas → 11,1%): representa
   "la primera cuota se cobra en el momento de la venta". Se recalcula al cambiar
   cuotas, siempre editable.

## Estructura de pestañas en /finanzas

- Pestaña `simulador` se renombra **"Simulación"** (antes "Productos y Simulación").
  Contiene: selector de modalidad → parámetros → tarjeta **Simulación** (el solver)
  → indicadores → tabla de flujo → guardar producto con nombre editable.
- Pestaña `precios` se renombra **"Productos"** (antes "Lista de Precios").
  Dos tarjetas:
  - **Venta Propia:** listado (no matriz) de productos guardados de modalidad
    propia — nombre, modelo, múltiplo, PVP, cuota, indicadores clave, acciones
    Cargar / Eliminar.
  - **Venta de Terceros:** la matriz actual de tasa de descuento por
    cuotas × estructura de liquidación, alimentada por los productos guardados de
    terceros, + listado con acciones.
  - "Cargar" navega a Simulación con los parámetros del producto puestos
    (estado compartido vía query param o estado elevado en el page — detalle de
    implementación).

## Flujo de la pestaña Simulación

1. **Selector de modalidad:** dos tarjetas (Venta Propia / Venta de Terceros),
   estilo tarjetas de Compras. Nada se simula hasta elegir.
2. **Parámetros agrupados en bloques** con títulos, estilo Finanzas, inputs con
   unidad visible:
   - **Operación:** modelo (solo propia), cuotas (default 9), anticipo %
     (default 100/cuotas), operaciones por mes, order amount (solo terceros,
     precargado con ticket promedio real 30d del canal).
   - **Costos e impuestos:** costos operativos % OA, imp. créditos %,
     imp. débitos %, IIBB %, flete $ (solo propia).
   - **Riesgo del canal:** incobrabilidad % (precargada del vintage del canal),
     mora promedio en días (precargada), con el panel de datos reales al lado.
   - **Fondeo y objetivo:** TNA de fondeo %, objetivo % sobre OA (default 15),
     estructura de liquidación/pago (splits, día 0 permitido).
3. **Panel "Datos reales del canal"** (solo lectura): incobrabilidad vintage de
   cohortes maduras del canal, FPD (default de 1.ª cuota, de Payment Defaults),
   mora promedio de recuperos, ticket promedio. Estos valores precargan los campos
   editables; el usuario puede pisarlos pero siempre ve el origen.
4. **Tarjeta "Simulación"** (el solver): muestra la palanca mínima que cumple el
   objetivo — propia: "Múltiplo mínimo X,XX → PVP $… / cuota $…" junto al múltiplo
   actual del modelo para comparar; terceros: "Tasa de descuento mínima X,X%".
   En propia agrega la **tasa implícita del crédito** (TNA y TEA).
5. **Indicadores:** resultado neto ($ y % sobre OA, contra el objetivo), capital
   requerido (pico), Deuda/OA, rentabilidad anual sobre capital (con caso
   "no requiere capital" cuando el flujo nunca es negativo), rentabilidad sobre OA,
   payback (alineado con las columnas de la tabla).
6. **Tabla de flujo de fondos** mensual por concepto, como hoy, con las filas
   nuevas (IVA, costo de mora) y sin "Ingreso colocación".
7. **Guardar producto:** input de nombre editable, sugerido con el nombre
   auto-generado (`generarNombreProducto`), que el usuario puede pisar.

## Motor de cálculo v2 (`lib/simulador.ts`, puro y testeado)

Un único motor determinístico `simularFlujoV2`. Por cohorte de operaciones del mes
`m0` con `N` ops:

### Venta propia

- `PVP = costo_sin_iva × múltiplo` (precio final al cliente, IVA incluido).
- **Cobros:** anticipo = `PVP × dp%` en `m0` (siempre se cobra); cuotas restantes
  iguales = `(PVP − anticipo) / (cuotas − 1)` en `m0+1 … m0+cuotas−1`.
- **Incobrabilidad:** el % se aplica cuota por cuota **sobre las cuotas
  financiadas** (el anticipo no). Fila propia negativa; el cobro efectivo del mes
  es `cuota × (1 − incob)`. (Corrige v1: calculaba sobre el OA completo, ~20%
  de pérdida inflada con 9 cuotas.)
- **Pago proveedor:** `costo_sin_iva × 1,21` en el mes `floor(plazo_días / 30)`
  del split — **día 0 permitido** (pago contado; v1 lo empujaba al mes 1 y
  subestimaba capital).
- **IVA:** débito fiscal = `PVP × 21/121` devengado COMPLETO en `m0` (la factura
  es por el total aunque se cobre en cuotas); crédito = `costo_sin_iva × 0,21`
  en `m0` (factura de compra). Posición neta mensual global (todas las cohortes);
  si es a pagar, se paga a AFIP en el mes siguiente; si es a favor, se arrastra
  contra posiciones futuras.
- **IIBB:** sobre ingreso devengado neto de IVA = `(PVP / 1,21) × iibb%`,
  mes vencido (`m0+1`). (Corrige v1: gravaba el OA bruto.)
- **Costos operativos:** `PVP × %` en `m0`. **Flete:** `$ × N` en `m0+1`.
- **Imp. créditos:** % sobre los cobros **efectivos** (netos de incobrabilidad).
  (Corrige v1: gravaba cobros nominales nunca recibidos.)
- **Imp. débitos:** % sobre **todos** los egresos bancarios (proveedor, flete,
  IIBB, IVA a AFIP, costos operativos). (Corrige v1: solo la liquidación.)
- **Mora:** cada cobro de cuota financiada se atrasa `mora_días` promedio →
  fila "Costo de mora" = `cobro_efectivo × TNA/365 × mora_días` en el mes del
  cobro. Continua, sin saltos de 30 días (v1: ceil a mes entero).
- **Fondeo:** fila "Costo financiación" = saldo acumulado negativo del mes
  anterior × `TNA/12`. **Sin "Ingreso colocación"** (v1 contaminaba el resultado
  con tesorería y lo hacía depender del largo del horizonte).
- **Horizonte:** termina en el último mes con movimiento real. Sin padding.

### Venta de terceros

- `OA` editable (precargado ticket promedio 30d del canal). Cobros del cliente:
  igual que propia (anticipo + cuotas iguales, incobrabilidad y mora del canal
  terceros).
- **Liquidación al comercio:** `OA × (1 − d)` según splits (día 0 permitido).
- **IVA:** la comisión `OA × d` es IVA incluido → débito = `OA × d × 21/121`,
  pagado mes vencido. Sin crédito de compra.
- **IIBB:** sobre comisión neta de IVA = `OA × d / 1,21`, mes vencido.
- **Costos operativos** sobre OA en `m0`. Sin flete ni costo de equipo.
- Imp. créditos/débitos, mora y fondeo: mismas reglas que propia.

### Indicadores

- `resultado_neto` = acumulado final; `resultado_pct_oa` = resultado / (OA × ops).
- `capital_requerido` = pico negativo del acumulado; `ct_deuda_ratio` =
  capital / (OA × ops); `capital_promedio` como v1.
- `payback`: primer mes (índice de columna, **alineado con la tabla** — v1 tenía
  off-by-one) donde el acumulado queda ≥ 0 después de haber sido negativo.
- `rent_anual_capital` como v1, pero si el acumulado nunca es negativo devuelve
  un flag `sin_capital: true` (la UI muestra "No requiere capital" en vez de 0%).
- `tir_implicita` (solo propia): TIR mensual del flujo contractual del crédito
  bajo la premisa margen-de-producto-cero: `−costo_con_iva` en `m0`, `+cuotas
  contractuales` (brutas, sin incobrabilidad — es la tasa pactada con el cliente,
  no la esperada). Se expresa como TNA (×12) y TEA ((1+i)^12 − 1). Bisección
  sobre el VAN.

### Solver

Búsqueda binaria de la palanca mínima sobre el propio `simularFlujoV2` — nunca
puede desincronizarse de la tabla:

- Propia: múltiplo en `[1, 5]`; terceros: `d` en `[0, 0,6]`.
- El resultado neto es monótono creciente en la palanca. ~60 iteraciones,
  tolerancia 0,001. Si el objetivo no se alcanza en el rango → la tarjeta muestra
  aviso "objetivo inalcanzable con estos parámetros" en vez de un número.

## Datos reales — plumbing

Nueva acción `lib/actions/simulador-datos.ts` que arma un `DatosCanal` por
modalidad, fetcheado server-side en `page.tsx` y pasado al tab:

- **Costos y precios por modelo (propia):** `getListaPrecios()` de
  `lib/actions/lista-precios-canales.ts` (costo sin IVA por proveedor preferido,
  múltiplo actual, PVP, cuota, precio tienda). Reuso directo.
- **Incobrabilidad por canal:** variante de `fetchVintageAnalysis` parametrizada
  por client_ids del canal (propio vs terceros — mismo split que usa
  Resultado/Upselling); % incobrable de cohortes maduras (originación ≥ 6 meses
  atrás).
- **FPD por canal:** default de 1.ª cuota, variante por canal de los datos de
  Payment Defaults (`fetchPDIndicadores`).
- **Mora promedio por canal:** promedio ponderado de los buckets de recupero del
  vintage (punto medio de cada bucket × monto).
- **Ticket promedio terceros:** promedio de OA del canal terceros últimos 30d.

## Persistencia

- Tabla `productos_financieros` sin cambios de esquema. `parametros` lleva
  `schema_version: 2` y `nombre` es el custom del usuario.
- Limpieza one-time: borrar los registros v1 existentes (SQL nombrada en
  Supabase SQL Editor, según convención del proyecto).

## Eliminaciones

- `simularEstocastico`, `randNormal`, tipos `ResultadoEstocastico`, inputs de
  desvíos y píldoras det/est.
- Modalidad `consignatarios` (input, filtros, fila de comisión). `lib/actions/asignar.ts`
  y demás no se tocan — esto es solo el simulador.
- "Ingreso colocación" y su nota al pie.

## Tests (bloqueantes: sin verde no se cablea la UI)

En el runner del repo, junto a los tests existentes de `lib/`:

1. **Flujo propia calculado a mano:** 1 op, costo $100.000, múltiplo 2, 9 cuotas,
   DP 11,1%, pago proveedor día 0, TNA 45%, incob 3%, mora 15d, impuestos
   default — cada fila y cada mes verificados contra planilla externa.
2. **Flujo terceros calculado a mano:** 1 op, OA $150.000, d 15%, splits 50/50 a
   0/30d — ídem.
3. **Solver:** para un caso con solución conocida (calculada por fuera), converge
   al múltiplo/tasa correcto ±0,001; caso inalcanzable devuelve el flag.
4. **TIR implícita:** contra un crédito sintético de tasa conocida (ej. flujo
   armado con TEM 5% exacta → la TIR debe dar 5%).
5. **Casos borde:** capital nunca negativo (`sin_capital`), 1 cuota, split día 0
   vs día 30 (el capital requerido debe diferir en el fondeo de un mes), IVA a
   favor arrastrado, payback alineado con el índice de columna.
6. **IVA:** débito completo en `m0` aunque las cuotas sigan; posición neta
   correcta con múltiplo 2.

## Fuera de alcance v2

- Curva de incobrabilidad por número de cuota / FPD explícito en el motor.
- Escenario estresado (incob ×1,5) como segunda columna — candidato a v3.
- Cambios en el resto de las pestañas de Finanzas.
