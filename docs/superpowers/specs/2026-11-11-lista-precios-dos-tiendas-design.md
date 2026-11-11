# Lista de precios y gestor para dos tiendas (GOcelular + GOmarket)

**Fecha:** 2026-11-11 · **Decisiones de Emiliano:** 11/11/2026

## Intención y porqué

GOcelular360 pasa a operar dos tiendas: **GOcelular** (celulares y accesorios, como hasta ahora) y **GOmarket** (electro: TV, pequeños electrodomésticos, etc.). El gestor de compras ya distingue plataforma por producto, pero la **lista de precios está diseñada solo para GOcelular**: los productos GOmarket no aparecen solos (el gate de inclusión usa ventas de la tienda GOcelular), la columna "Tienda" no sabe leer el PVP de GOmarket, y al fijar precio **no trae el costo** aunque esté cargado en el gestor. Emiliano necesita poder trabajar ambas tiendas ordenadamente, filtrando por tienda y por tipo de producto.

**Dónde duele hoy (reportado por Emiliano):** en /canales/lista-precios, al querer ponerle precio a productos GOmarket, la columna Costo viene vacía.

## Decisiones ya tomadas (Emiliano, 11/11)

1. El problema a resolver es **en la lista de precios** (el armado de pedidos del gestor no es el foco).
2. **Margen GOmarket: múltiplo propio por producto** (igual mecánica que GOcelular) con un **default distinto para GOmarket**.
3. **El PVP de GOmarket se publica A MANO en su admin.** La lista del 360 sugiere el PVP y controla desvíos contra el precio publicado real. NO se construye publicación por webhook (v2 si algún día Pedro da endpoint).

## Goals

- Pestaña/filtro de **tienda** en la lista de precios: GOcelular (idéntica a hoy) y GOmarket (nueva).
- La vista GOmarket muestra **todos** los productos de plataforma gomarket no ocultos, con su **costo del gestor** (compras_precios), **múltiplo editable por producto**, **PVP sugerido**, y columna **"Tienda"** con el precio real publicado en GOmarket para marcar desvíos.
- Filtro por **categoría** (las categorías gomarket son dinámicas, vienen del sync de commerce).
- Filtros por tienda y categoría también en **/compras/gestor** (pedidos) y **/compras/modelos** (catálogo + grilla de costos).
- Que no vuelva a pasar "producto sin costo invisible": fila sin costo se muestra con aviso y link directo a cargarlo.

## Non-goals

- Publicar precios a GOmarket automáticamente (decisión: manual en su admin).
- Bonos, notas de crédito, seguro por robo y margen extra para GOmarket (son reglas del negocio celulares; quedan solo en la vista GOcelular).
- Cambiar el flujo de informe de compras (webhook commerce) — ya funciona.
- Gate de inclusión por ventas para GOmarket: commerce_orders tiene 0 órdenes hoy; se incluyen todos. Cuando GOmarket venda, se podrá replicar el gate con commerce_order_items (futuro).

## Anti-goals (esto sería un fracaso)

- Que la vista GOcelular cambie en algo: misma tabla, mismas reglas (seguro, bonos, cuota ×9, múltiplo 2,34 default), mismos manuales.
- Que publicar precios (el cron/republicación a la tienda GOcelular) toque productos GOmarket.
- Que un producto GOmarket con costo cargado siga mostrando costo vacío.

## Estado actual (relevado 11/11)

- `compras_productos.plataforma`: 'gocelular' (58 productos) | 'gomarket' (14: 9 "Pequeños Electrodomesticos", 5 "TV, Sonido y Electronicos"). 11 de 14 gomarket tienen costo en `compras_precios`; los 3 sin costo son los nuevos (2 TV Hisense/Newsan + 1 electro).
- `compras_precios` (producto×proveedor) es agnóstica de plataforma — sirve tal cual.
- Lista de precios: `lib/actions/lista-precios-canales.ts` + lógica pura `lib/lista-precios.ts` (`armarListaPrecios`, testeada). Gate de inclusión: `ventas30d === 0 && !fijados.has(id) → continue`, con ventas de `fetchVentasPorModelo()` (tienda GOcelular). Columna Tienda: `fetchPreciosTiendaCelulares` (por nombre) / `fetchPreciosTiendaPorSku` (por codigo) — ambas de `store_products` (GOcelular).
- PVP de GOmarket real: réplica `commerce_listing_skus.price` (join `commerce_skus.sku` = `compras_productos.codigo`). Verificado que existe la columna.
- La página ya tiene pestañas internas (Lista / Bonos / NC / Margen extra — `TabsListaBonos`).
- Grilla de costos en /compras/modelos: un proveedor aparece para un producto solo si tiene tildada la categoría (pills de `compras_proveedores.tipos`, las gomarket en violeta).
- Estilo UI del repo: pills tipo CanalPills (Finanzas) y tabs FinanzasTabs (memoria de estilo de Emiliano).

## Diseño

### 1. Selector de tienda en la lista de precios

Pills **`GOcelular | GOmarket`** arriba del contenido, patrón CanalPills (componente cliente, estado en `?tienda=`). Afectan la pestaña **Lista**; las pestañas Bonos, Notas de crédito y Margen extra son de GOcelular y se ocultan al seleccionar GOmarket.

### 2. Vista Lista GOmarket

Tabla con columnas: Producto · Categoría · Costo (proveedor elegido, mismo `elegirCosto` — sin preferido por marca cae al más barato) · Múltiplo (editable por producto, misma action que hoy) · PVP sugerido · Cuota (PVP/9) · **Tienda GOmarket** (precio real de `commerce_listing_skus.price`) · Dif (Tienda vs PVP sugerido, chip verde/rojo si difieren >1%).

- Inclusión: todos los productos `plataforma='gomarket'` no ocultos (sin gate de ventas).
- Fórmula del PVP sugerido: `cuota = ceil(costo × múltiplo / 9 / 100) × 100; pvp = cuota × 9` — **mi decisión**: misma regla de redondeo a cuota de 9 que GOcelular, porque GOmarket también vende en cuotas GOcuotas; sin recargo de seguro ni bonos.
- Default de múltiplo GOmarket: clave nueva `listaprecios_multiplo_default_gomarket` en flujo_config, editable desde la UI (un input chico arriba de la tabla). **Mi decisión**: valor inicial **1,40** hasta que Emiliano lo ajuste (el electro lleva menos margen que celulares; es solo el punto de partida, cada producto se pisa individual).
- Fila sin costo: celda Costo en rojo "sin costo" + link a `/compras/modelos?producto=<id>` para cargarlo.
- Filtro de categoría: desplegable con las categorías gomarket presentes.

### 3. Lectura del PVP real de GOmarket

Fetcher nuevo en `lib/gocelular.ts`: `fetchPreciosListingGomarket(): Record<sku, number>` leyendo `commerce_listing_skus.price` join `commerce_skus` (activos). Envuelto en `cachear(..., 1h)` como el resto de las lecturas analíticas (audit de Pedro). Si el producto no tiene listing → columna Tienda "—" (no publicado todavía).

### 4. Filtros en el gestor y en modelos

- **/compras/modelos**: se AGREGAN pills de tienda (GOcelular | GOmarket | Todas, default "Todas"); las pills de categoría **existentes quedan como están, con su default 'Celulares'** (decisión mía tras el builder check: la página ya tiene pills de categoría dinámicas y cambiar su default rompería el arranque de una pantalla de uso diario). No se agrega desplegable de categoría acá — sería redundante.
- **/compras/gestor**: pills de tienda sobre la lista de pedidos, default "Todas". La plataforma de un pedido = plataforma de sus productos (los pedidos mixtos ya están bloqueados por validación; el gestor ya la deriva). Pedidos viejos sin plataforma derivable → aparecen en "Todas".

### 5. Costo faltante: ya no hay causa raíz de código — es visibilidad + datos

**Corrección del builder check (11/11):** el filtro "proveedor solo aparece si tiene la categoría tildada" **ya fue eliminado el 30/10** (commit `17e5ce3`, "todos los proveedores pueden vender cualquier categoria") — hoy la grilla de /compras/modelos muestra todas las columnas de proveedor para cualquier categoría. No se construye ningún auto-tildado (sería código muerto).

Lo que queda: (a) el **aviso "sin costo" con link** en la fila de la lista de precios (sección 2); (b) **cargar los costos de los 3 productos GOmarket** que faltan (2 TV Hisense + 1 electro) — tarea de datos de Emiliano, la lista se los va a marcar en rojo.

### 6. Proceso operativo (documentar en el manual)

Orden de trabajo para producto GOmarket nuevo: (1) alta en el admin de GOmarket (producto + SKU + EAN) → el 360 lo sincroniza solo; (2) costo del proveedor en /compras/modelos apenas se negocia; (3) pedido en el gestor; (4) PVP: mirar la lista de precios GOmarket, fijar múltiplo, cargar el PVP a mano en el admin de GOmarket; la columna Dif del 360 avisa si quedaron desalineados.

## Qué queda al criterio del constructor

- Nombres de componentes/archivos y dónde separar lógica pura (seguir el patrón `lib/lista-precios.ts` con tests puros para el armado GOmarket).
- Shape exacto de la fila GOmarket (puede reusar `FilaListaPrecios` con campos opcionales o un tipo propio — lo que menos toque la vista GOcelular).
- Detalles de UI menores (anchos, orden de columnas) siguiendo el estilo de la tabla actual.
- Cómo derivar la plataforma de un pedido del gestor (lookup de productos por id de los items).

## Riesgos / cuidados

- **Separación por plataforma (decisión mía tras el builder check):** `getListaPrecios()` pasa a ser explícitamente GOcelular-only (filtro `plataforma`), y los productos gomarket que hoy estén "fijados" en la lista **se mudan a la pestaña GOmarket** (no es una regresión del anti-goal: "idéntica a hoy" refiere a las reglas y filas de productos GOcelular). Esto también blinda a los consumidores de `getListaPrecios` (publicar-precios, simulador, PDF de bonos) que son todos del negocio celulares.
- **Verificación previa del constructor** sobre `commerce_listing_skus.price` (nadie lo lee hoy en el repo): confirmar contra la réplica la UNIDAD (pesos vs centavos — commerce usa `amount_in_cents` en otros lados) y la CARDINALIDAD (qué listing gana si un SKU tiene varios) antes de armar la columna Dif.
- NO tocar `armarListaPrecios` de forma que cambie una sola fila de la vista GOcelular (tests existentes deben seguir verdes sin modificar expectativas).
- La republicación de precios por el seguro y el cron publicar-precios no deben ver productos gomarket (verificar que filtran por los productos que matchean store_products — hoy el match por nombre/sku ya los excluye de facto; agregar filtro explícito por plataforma para blindarlo).
- Manuales operativos: la página Lista de Precios tiene manual — al implementar, regenerarlo (regla del repo).
