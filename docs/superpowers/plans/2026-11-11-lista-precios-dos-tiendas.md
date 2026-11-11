# Lista de precios dos tiendas (GOcelular + GOmarket) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La lista de precios opera dos tiendas — GOcelular intacta y una vista GOmarket nueva con costo del gestor, múltiplo por producto y control contra el PVP real publicado — y el gestor/modelos filtran por tienda.

**Architecture:** Lógica pura nueva en `lib/lista-precios-gomarket.ts` (testeada), action `getListaPreciosGomarket()` junto a la existente, pills de tienda por querystring en la página; `getListaPrecios()` pasa a filtrar `plataforma`. El PVP real de GOmarket se lee de la réplica (`commerce_listing_skus`) con el cache de 1h del repo.

**Tech Stack:** Next.js 14 (App Router, server actions), Supabase, pg (réplica GOcelular), vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-lista-precios-dos-tiendas-design.md`

## Global Constraints

- La vista GOcelular NO cambia: los tests existentes de `__tests__/lista-precios*.test.ts` siguen verdes sin tocar expectativas.
- Lecturas a la réplica de GOcelular/commerce van envueltas en `cachear(..., UNA_HORA)` (audit de Pedro, patrón de `lib/gocelular.ts`).
- UI: pills estilo CanalPills/Finanzas (memoria de estilo); textos en castellano.
- Fórmula PVP GOmarket: `cuota = ceil(costo × múltiplo / 9 / 100) × 100; pvp = cuota × 9`; sin recargo de seguro ni bonos.
- Default múltiplo GOmarket: clave flujo_config `listaprecios_default_multiplo_gm` (NO usar el prefijo `listaprecios_multiplo_` — colisionaría con el parser por-producto), valor inicial **1.40**.
- Filtro de categorías GOmarket: SIEMPRE las de `getCategoriasGomarket()` (commerce_categories activas) — nunca hardcodear.

## Review Focus

- Producto GOmarket **sin costo cargado** → fila visible con "sin costo" en rojo y link a Modelos, nunca fila omitida ni PVP calculado. (Test en Task 2.)
- Producto GOmarket **sin listing publicado** (sin fila en commerce_listing_skus) → columna Tienda "—" y sin chip de dif. (Test en Task 2.)
- `commerce_listing_skus.price` en **centavos vs pesos** y SKU con **varios listings** → verificación contra la réplica antes de codear; elegir el listing activo más reciente. (Paso de verificación en Task 1.)
- Producto gomarket **fijado hoy en la lista GOcelular** (`listaprecios_incluidos`) → desaparece de GOcelular y aparece en GOmarket; la fila GOcelular restante no cambia. (Test en Task 3.)
- Pedido del gestor **viejo sin plataforma derivable** → aparece con el filtro "Todas" y no revienta el derive. (Test en Task 5.)

---

### Task 1: Fetcher del PVP real de GOmarket

**Files:**
- Modify: `lib/gocelular.ts` (junto a `fetchStockGomarket`)

**Interfaces:**
- Produces: `fetchPreciosListingGomarket(): Promise<Record<string, number>>` — SKU → precio de lista publicado en GOmarket, EN PESOS. Export cacheado (`cachear(..., 'precios-listing-gomarket', UNA_HORA)`).

- [ ] **Step 1: Verificar unidad y cardinalidad contra la réplica** (consola con env saneado): `SELECT cs.sku, cls.price, cls.status/activo?, cls.created_at FROM commerce_listing_skus cls JOIN commerce_skus cs ON cs.id = cls.sku_id LIMIT 10` + columnas de commerce_listing_skus/commerce_listings. Anotar: ¿price en centavos? ¿puede haber >1 listing por sku? Elegir: listing de listings activos, el más reciente; convertir a pesos si hace falta.
- [ ] **Step 2: Implementar `fetchPreciosListingGomarketLive()` + export cacheado** en `lib/gocelular.ts` con el JOIN que resuelva lo verificado; `if (!pool) return {}`.
- [ ] **Step 3: Verificación por consola**: correr el fetcher vía `npx tsx` (patrón `.tmp.mts` con env saneado) y confirmar que devuelve los SKUs gomarket conocidos con precios razonables en pesos.
- [ ] **Step 4: Commit** `feat(gomarket): fetcher del PVP publicado (commerce_listing_skus, cache 1h)`

### Task 2: Lógica pura de la lista GOmarket (TDD)

**Files:**
- Create: `lib/lista-precios-gomarket.ts`
- Test: `__tests__/lista-precios-gomarket.test.ts`

**Interfaces:**
- Consumes: `elegirCosto`, `type CostoProveedor` de `lib/lista-precios.ts`.
- Produces:
  ```ts
  export interface FilaGomarket {
    productoId: string; nombre: string; categoria: string | null; codigo: string | null
    costo: { proveedor: string; precio: number } | null
    multiplo: number; pvp: number | null; cuota: number | null
    precioTienda: number | null   // listing real de GOmarket
    difPct: number | null         // (precioTienda - pvp) / pvp × 100; null si falta alguno
  }
  export function armarListaGomarket(
    productos: { id: string; nombre: string; categoria: string | null; codigo: string | null }[],
    costosPorProducto: Record<string, CostoProveedor[]>,
    multiplos: Record<string, number>,          // por producto id
    multiploDefault: number,
    preciosListingPorSku: Record<string, number>,
  ): FilaGomarket[]
  ```

- [ ] **Step 1: Escribir los tests que fallan** en `__tests__/lista-precios-gomarket.test.ts`:
  - `calcula pvp con la cuota de 9 redondeada a 100`: costo 100000, múltiplo 1.4 → cuota = ceil(140000/9/100)*100 = 15600, pvp 140400, difPct null sin precioTienda.
  - `sin costo: fila presente con costo null y pvp null` (nunca se omite).
  - `elige el costo más barato entre proveedores` (sin preferido por marca).
  - `multiplo por producto pisa al default`.
  - `precioTienda por codigo/SKU y difPct con signo`: pvp 140400, tienda 150000 → difPct ≈ 6.84 (redondeo a 2 decimales).
  - `producto sin codigo o sin listing → precioTienda null y difPct null`.
  - `ordena por categoria y nombre`.
- [ ] **Step 2: Correr y ver FAIL** — `npx vitest run __tests__/lista-precios-gomarket.test.ts` (module not found).
- [ ] **Step 3: Implementar `armarListaGomarket` en `lib/lista-precios-gomarket.ts`**.
- [ ] **Step 4: Correr y ver PASS.**
- [ ] **Step 5: Commit** `feat(gomarket): lógica pura de la lista de precios GOmarket (TDD)`

### Task 3: Actions — getListaPrecios GOcelular-only + getListaPreciosGomarket

**Files:**
- Modify: `lib/actions/lista-precios-canales.ts`
- Test: `__tests__/lista-precios-gomarket.test.ts` (sumar test de partición si la lógica de partición queda pura) — la partición simple por campo puede quedar sin test propio si se hace en la query.

**Interfaces:**
- Consumes: Task 1 (`fetchPreciosListingGomarket`), Task 2 (`armarListaGomarket`), `getCategoriasGomarket()` existente (`lib/actions/sync-gomarket.ts`), `getMultiplo/setMultiplo` existentes (claves `listaprecios_multiplo_<productoId>` — verificar nombre real del prefijo en el archivo y reusar).
- Produces:
  ```ts
  export async function getListaPreciosGomarket(): Promise<{
    filas: FilaGomarket[]
    categorias: string[]            // de getCategoriasGomarket()
    multiploDefault: number         // flujo_config listaprecios_default_multiplo_gm, default 1.4
  }>
  export async function setMultiploDefaultGomarket(valor: number): Promise<void>  // upsert + revalidatePath
  ```

- [ ] **Step 1: `getListaPrecios()` filtra plataforma**: en el select de `compras_productos` sumar `.neq('plataforma', 'gomarket')` (default de columna es 'gocelular'; si hay NULLs históricos, usar `.or('plataforma.is.null,plataforma.neq.gomarket')` — verificar NULLs con una query antes).
- [ ] **Step 2: Correr la suite existente** — `npx vitest run __tests__/lista-precios.test.ts` (o el nombre real) → PASS sin tocar expectativas.
- [ ] **Step 3: Implementar `getListaPreciosGomarket()` y `setMultiploDefaultGomarket()`** — productos `plataforma='gomarket'` no ocultos, costos desde `compras_precios` (mismo armado `costosPorProducto` que la action vecina), múltiplos por producto reusando el mecanismo existente, `fetchPreciosListingGomarket()` con `.catch(() => ({}))`.
- [ ] **Step 4: Verificación por consola**: script `.tmp.mts` que llama `getListaPreciosGomarket()`... (imports de 'use server' fuera de Next pueden fallar — si falla, verificar con queries equivalentes: 14 filas esperadas, 11 con costo). Expected: filas=14, sin tirar.
- [ ] **Step 5: Commit** `feat(gomarket): action de lista de precios GOmarket + GOcelular filtra plataforma`

### Task 4: UI — pills de tienda y tabla GOmarket en /canales/lista-precios

**Files:**
- Create: `app/(admin)/canales/lista-precios/TiendaPills.tsx` (client: pills GOcelular|GOmarket, estado en `?tienda=`, patrón CanalPills)
- Create: `app/(admin)/canales/lista-precios/ListaGomarketTable.tsx` (client)
- Modify: `app/(admin)/canales/lista-precios/page.tsx`

**Interfaces:**
- Consumes: Task 3. `setMultiplo` existente para editar múltiplo por producto (verificar firma en el repo y reusar tal cual); `setMultiploDefaultGomarket`.
- Produces: página con `searchParams.tienda`: ausente/'gocelular' → render actual EXACTO (incluye TabsListaBonos completo); 'gomarket' → `<ListaGomarketTable filas categorias multiploDefault />`, sin pestañas de Bonos/NC/Margen extra.

- [ ] **Step 1: `TiendaPills`** — client component, `router.replace` preservando el resto del querystring, `scroll: false`.
- [ ] **Step 2: `page.tsx`** — leer `searchParams.tienda`; rama gomarket llama SOLO `getListaPreciosGomarket()` (no corre el armado GOcelular completo al pedo); pills arriba en ambas ramas.
- [ ] **Step 3: `ListaGomarketTable`** — columnas Producto · Categoría · Costo (proveedor + precio; sin costo → texto rojo "sin costo" + link `/compras/modelos`) · Múltiplo (input editable, blur → `setMultiplo`) · PVP sugerido · Cuota ·  Tienda GOmarket · Dif (chip verde |dif|≤1%, rojo >1%, "—" sin datos). Pills de categoría arriba (de `categorias`, default Todas) + input del múltiplo default (blur → `setMultiploDefaultGomarket`). Estilo: tabla compacta como la existente.
- [ ] **Step 4: Verificación** — `npx tsc --noEmit` limpio (salvo preexistente de gocelular-prices.test) y `npx next build` compila.
- [ ] **Step 5: Commit** `feat(gomarket): vista GOmarket en lista de precios con pills de tienda`

### Task 5: Filtros de tienda en /compras/modelos y /compras/gestor

**Files:**
- Modify: `app/(admin)/compras/modelos/ModelosClient.tsx` (pills de tienda ADEMÁS de las pills de categoría existentes; default Todas; filtra por `producto.plataforma`)
- Modify: `app/(admin)/compras/gestor/GestorClient.tsx` (pills de tienda sobre la lista de pedidos; plataforma del pedido = la que el gestor ya deriva de sus productos; sin derivable → bucket Todas)
- Test: `__tests__/` — SOLO si la derivación de plataforma del pedido se extrae a función pura nueva; si ya existe derivada en el código, no duplicar.

- [ ] **Step 1: Ubicar la derivación de plataforma existente en GestorClient** (el builder check confirmó que existe) y extraer/usar `plataformaDePedido(pedido, productosById): 'gocelular' | 'gomarket' | null`.
- [ ] **Step 2: Test de la función pura** (si se extrajo): pedido con productos gomarket → 'gomarket'; sin items matcheables → null. FAIL → implement → PASS.
- [ ] **Step 3: Pills en ambos clients** — mismo look que las pills existentes de la página; filtro en memoria (los dos ya tienen todo client-side).
- [ ] **Step 4: `npx vitest run` + `npx tsc --noEmit`** verdes.
- [ ] **Step 5: Commit** `feat(compras): filtro por tienda en modelos y gestor`

### Task 6: Blindajes y cierre

**Files:**
- Modify: `lib/actions/publicar-precios.ts` (filtro explícito `plataforma !== 'gomarket'` además del `categoria === 'Celulares'` existente)
- Modify: ficha del proyecto en memoria + manual

- [ ] **Step 1: Blindaje publicar-precios** — sumar el filtro de plataforma donde arma el universo a publicar; correr su test si existe.
- [ ] **Step 2: Suite completa + build** — `npx vitest run` (todas verdes) y `npx next build`.
- [ ] **Step 3: Deploy** — `git push` + `npx vercel --prod`; smoke: la página de lista responde (302 a login), `?tienda=gomarket` no rompe el build de RSC (ver logs del deploy).
- [ ] **Step 4: Manual operativo** — el manual de Lista de Precios quedó desactualizado (vista nueva): dejarlo ANOTADO como pendiente para regenerar con capturas autenticadas (falta la password de Emiliano); sumar al mensaje final.
- [ ] **Step 5: Commit final** `feat(gomarket): blindaje publicar-precios solo GOcelular`
