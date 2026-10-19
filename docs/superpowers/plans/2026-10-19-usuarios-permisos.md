# Usuarios y Permisos (Ver/Operar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel de administración de usuarios con permisos Ver/Operar por persona, por sección y submenú, para GOcelular360.

**Architecture:** Catálogo estático de secciones/subitems en código + tabla `usuarios_permisos` en Supabase (única con RLS) como fuente de verdad. El rol vive en `app_metadata` (inmodificable por el usuario). El middleware resuelve Ver por ruta para rol `restringido`; los server components filtran pestañas; las server actions de escritura de Finanzas chequean Operar. Panel `/usuarios` solo para super admin (Emiliano).

**Tech Stack:** Next.js 14 App Router, Supabase (auth + Postgres), Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-usuarios-permisos-design.md`

## Global Constraints

- Dominios de mail permitidos para altas: `['gocuotas.com']` (constante, validada server-side, case-insensitive y con trim).
- El rol que decide acceso se lee SIEMPRE de `app_metadata.rol` (valores: `admin` | `restringido` | `consignatario`). `user_metadata.rol` deja de usarse para autorización.
- Operar implica Ver en toda la lógica (guardar `'operar'` otorga ambos).
- Ver v1 protege pantallas/navegación y payload de pestañas; NO blinda fetch actions de lectura (decidido en la spec).
- `usuarios_permisos` es la ÚNICA tabla del repo con RLS (SELECT solo fila propia; cero policies de escritura; el servidor escribe con service role).
- Default deny: ruta admin no catalogada o subitem sin tilde → el restringido rebota.
- Único super admin inicial: emiliano.canova@gocuotas.com. Otros `admin` conservan la app completa pero no `/usuarios`.
- Textos de UI en español, estilo del repo (tablas compactas, botones `bg-gray-900`, cards estilo Compras para navegación).
- Tests: `npx vitest run __tests__/<archivo>` ; lógica pura en `lib/` con test en `__tests__/`.
- Deploy: `npx vercel --prod` (git push NO deploya). La migración de roles (Task 10) corre ANTES del deploy del código que lee `app_metadata`.

## Review Focus

Casos que la spec implica y que una persona real va a pisar; cada uno tiene su test agregado en la task dueña:

1. Mail con mayúsculas/espacios (`" Maria.Perez@GOcuotas.COM "`) debe pasar la validación de dominio → test en Task 2 (`emailPermitido`).
2. Restringido con permisos vacíos `{}` no debe entrar en loop de redirects: aterriza en `/sin-acceso` → test en Task 2 (`primeraRutaPermitida({}) === null`) + rama explícita en middleware (Task 5).
3. Ruta nueva sin catalogar (p. ej. se agrega `app/(admin)/nueva/` y nadie toca el catálogo) → default deny para restringidos, y el test de cobertura de Task 1 falla en CI para forzar catalogarla.
4. Alta con mail ya registrado → error claro "ese mail ya tiene usuario", sin fila duplicada ni invitación fantasma → manejo del error de Supabase en `crearUsuario` (Task 8) y prueba explícita del duplicado en Task 8 Step 6.
5. Login de consignatarios tras la migración de roles: `app_metadata.rol='consignatario'` debe seguir ruteando a `/mi-dashboard` → verificación explícita en Task 10 (smoke con cuenta test consignatario@gocelular.com).

---

### Task 1: Catálogo de permisos

**Files:**
- Create: `lib/permisos-catalogo.ts`
- Test: `__tests__/permisos-catalogo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NivelPermiso = 'ver' | 'operar'
  export type Permisos = Record<string, Record<string, NivelPermiso>> // seccionId -> subitemId -> nivel
  export const SUBITEM_ROOT = 'root'
  export type SubitemCatalogo = { id: string; label: string; ruta?: string; tab?: string; operar: boolean }
  export type SeccionCatalogo = { id: string; label: string; icon: string; href: string; external?: boolean; subitems: SubitemCatalogo[] }
  export const CATALOGO: SeccionCatalogo[]
  ```
- Reglas del catálogo: `id` de sección = segmento de ruta (`finanzas`, `compras`…) o slug para externas (`centro-operaciones`). Secciones de página única → un subitem `SUBITEM_ROOT` (`ruta` = href). Hubs → subitem `SUBITEM_ROOT` (la página hub) + un subitem por subruta directa (`ruta` = path completo, ej. `/compras/envios`). Finanzas → subitem `SUBITEM_ROOT` + 9 subitems con `tab` = id real de pestaña: `flujo`, `egresos`, `deuda`, `indicadores` (Payment Defaults), `dpd`, `vintage`, `simulador`, `precios` (Productos), `resultado` — todos `operar: true` salvo `indicadores`/`dpd`/`vintage` (solo lectura, `operar: false`). Links externos del sidebar → sección con `external: true`, un subitem ROOT `operar: false`.

- [ ] **Step 1: Escribir el test de cobertura de rutas (fallará)**

```ts
// __tests__/permisos-catalogo.test.ts
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { CATALOGO } from '@/lib/permisos-catalogo'

test('toda ruta top-level de app/(admin) está catalogada', () => {
  const base = join(__dirname, '..', 'app', '(admin)')
  const dirs = readdirSync(base).filter(d => statSync(join(base, d)).isDirectory())
  const rutasCatalogo = new Set(
    CATALOGO.flatMap(s => [s.href, ...s.subitems.map(i => i.ruta ?? '')]).map(r => r.split('/')[1])
  )
  for (const dir of dirs) expect(rutasCatalogo).toContain(dir)
})

test('finanzas tiene las 9 pestañas con los ids reales', () => {
  const fin = CATALOGO.find(s => s.id === 'finanzas')!
  const tabs = fin.subitems.filter(i => i.tab).map(i => i.tab)
  expect(tabs).toEqual(['flujo', 'egresos', 'deuda', 'indicadores', 'dpd', 'vintage', 'simulador', 'precios', 'resultado'])
})

test('ids de sección únicos y subitems únicos por sección', () => {
  const ids = CATALOGO.map(s => s.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const s of CATALOGO) {
    const sub = s.subitems.map(i => i.id)
    expect(new Set(sub).size).toBe(sub.length)
  }
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run __tests__/permisos-catalogo.test.ts`
Expected: FAIL (módulo inexistente)

- [ ] **Step 3: Escribir `lib/permisos-catalogo.ts`**

Enumerar con `ls app/(admin)/` (28 rutas: alertas-fraudes, auditoria-stock, auditorias, canales, celia, compras, consignatarios, dashboard, diferencias, documentacion, finanzas, garantias, grupo-go, inventario, knox-guard, liquidaciones, mayoristas, modelos, notas, novedades, pase-contabilidad, reclutamiento, reportes, segmentos, sync, terceros, upselling, ventas) y las subrutas directas de los hubs (`ls app/(admin)/compras app/(admin)/canales app/(admin)/inventario app/(admin)/consignatarios app/(admin)/mayoristas app/(admin)/grupo-go`). Labels/íconos: copiar de `navItems` en `app/(admin)/layout.tsx:7-26`; rutas sin item de sidebar usan label capitalizado e icon `'dashboard'`. `operar: true` solo donde la pantalla tiene accionables de escritura evidentes (hubs de gestión); ante la duda `true` (el tilde Operar simplemente no hará nada hasta que esa sección tenga guard).

- [ ] **Step 4: Correr tests y verificar que pasan**

Run: `npx vitest run __tests__/permisos-catalogo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/permisos-catalogo.ts __tests__/permisos-catalogo.test.ts
git commit -m "feat(permisos): catálogo de secciones y subitems"
```

### Task 2: Lógica pura de permisos

**Files:**
- Create: `lib/permisos.ts`
- Test: `__tests__/permisos.test.ts`

**Interfaces:**
- Consumes: `CATALOGO`, `Permisos`, `NivelPermiso`, `SUBITEM_ROOT` de Task 1.
- Produces (todas puras, sin I/O):
  ```ts
  export function emailPermitido(email: string, dominios?: string[]): boolean // default DOMINIOS_PERMITIDOS = ['gocuotas.com']
  export function puedeVer(permisos: Permisos, seccion: string, subitem?: string): boolean   // default SUBITEM_ROOT; 'operar' también da ver
  export function puedeOperar(permisos: Permisos, seccion: string, subitem?: string): boolean
  export function rutaPermitida(permisos: Permisos, pathname: string): boolean  // matchea contra CATALOGO por prefijo más largo; no catalogada => false
  export function primeraRutaPermitida(permisos: Permisos): string | null      // primer subitem interno con ver, en orden de CATALOGO; {} => null
  export function filtrarNavItems(permisos: Permisos): SeccionCatalogo[]        // secciones con ≥1 subitem visible
  export function tabsPermitidas(permisos: Permisos, seccion: string, tabIds: string[]): string[]
  ```
- Semántica pin: acceso a la página hub de una sección = `puedeVer(seccion, SUBITEM_ROOT)`; un subitem con `ruta` se matchea por `pathname === ruta || pathname.startsWith(ruta + '/')`; si el pathname matchea la sección pero ningún subitem con ruta, decide el ROOT.

- [ ] **Step 1: Escribir tests (fallarán)** — casos mínimos:

```ts
test('emailPermitido acepta gocuotas.com con mayúsculas y espacios', () => {
  expect(emailPermitido(' Maria.Perez@GOcuotas.COM ')).toBe(true)
  expect(emailPermitido('alguien@gmail.com')).toBe(false)
  expect(emailPermitido('x@gocuotas.com.ar')).toBe(false)
})
test('operar implica ver', () => {
  const p = { finanzas: { flujo: 'operar' as const } }
  expect(puedeVer(p, 'finanzas', 'flujo')).toBe(true)
  expect(puedeOperar(p, 'finanzas', 'flujo')).toBe(true)
  expect(puedeOperar({ finanzas: { flujo: 'ver' as const } }, 'finanzas', 'flujo')).toBe(false)
})
test('rutaPermitida: subruta de hub, default deny en no catalogada', () => {
  const p = { compras: { root: 'ver' as const, envios: 'ver' as const } }
  expect(rutaPermitida(p, '/compras/envios')).toBe(true)
  expect(rutaPermitida(p, '/compras/forecast')).toBe(false)
  expect(rutaPermitida(p, '/ruta-inventada')).toBe(false)
})
test('permisos vacíos: primeraRutaPermitida null, nav vacío', () => {
  expect(primeraRutaPermitida({})).toBeNull()
  expect(filtrarNavItems({})).toEqual([])
})
test('tabsPermitidas filtra y conserva orden', () => {
  const p = { finanzas: { flujo: 'operar' as const, resultado: 'ver' as const } }
  expect(tabsPermitidas(p, 'finanzas', ['flujo', 'egresos', 'resultado'])).toEqual(['flujo', 'resultado'])
})
```

- [ ] **Step 2: Correr y verificar FAIL** — `npx vitest run __tests__/permisos.test.ts`
- [ ] **Step 3: Implementar `lib/permisos.ts`**
- [ ] **Step 4: Correr y verificar PASS** — mismo comando
- [ ] **Step 5: Commit** — `git commit -m "feat(permisos): lógica pura ver/operar"`

### Task 3: Tabla `usuarios_permisos` + scripts de migración

**Files:**
- Create: `scripts/usuarios-permisos.sql`
- Create: `scripts/migrar-roles-app-metadata.mjs`

**Interfaces:**
- Produces: tabla `public.usuarios_permisos` — `user_id uuid PK references auth.users`, `email text not null`, `super_admin boolean default false`, `activo boolean default true`, `permisos jsonb default '{}'`, `created_at/updated_at timestamptz default now()`. RLS: `enable row level security` + una sola policy `select` con `using (auth.uid() = user_id)`. Sin policies de insert/update/delete (service role bypassea).
- Script de migración (idempotente, se corre con `node scripts/migrar-roles-app-metadata.mjs`, lee `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de `.env.local` — OJO: valores con `\n` literales dentro de comillas, sanear al parsear):
  1. `auth.admin.listUsers` paginado; a cada usuario le estampa `app_metadata.rol = user_metadata.rol` si no lo tiene.
  2. victor.kislo@gocuotas.com → `app_metadata.rol='restringido'` + upsert fila en `usuarios_permisos` con `permisos = {"dashboard":{"root":"ver"},"alertas-fraudes":{"root":"ver"},"terceros":{"root":"ver"}}`.
  3. emiliano.canova@gocuotas.com → upsert fila con `super_admin=true`.
  4. Loguea por consola cada cambio y termina con resumen `{usuarios, estampados, saltados}`.

- [ ] **Step 1: Escribir `scripts/usuarios-permisos.sql`** (con comentario de nombre de query para el SQL Editor, regla del repo: "Usuarios Permisos — tabla y RLS").
- [ ] **Step 2: Ejecutarlo contra Supabase** — `psql` al pooler `aws-1-us-west-2.pooler.supabase.com:5432` user `postgres.rnjxmmcsxmyaktseegvt` (password en memoria del proyecto / `.env.local`), o pedirle a Emiliano correrlo en el SQL Editor si psql no está disponible.
Expected: `\d usuarios_permisos` muestra la tabla con `rowsecurity = on` y 1 policy.
- [ ] **Step 3: Verificar el deny de escritura anon** — con la anon key: `curl -X PATCH "https://rnjxmmcsxmyaktseegvt.supabase.co/rest/v1/usuarios_permisos?user_id=eq.00000000-0000-0000-0000-000000000000" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -d '{"super_admin":true}'`
Expected: 0 filas afectadas / error de policy — nunca 200 con cambio.
- [ ] **Step 4: Escribir `scripts/migrar-roles-app-metadata.mjs`** (NO correrlo en prod todavía — eso es Task 10; probar en seco con un flag `--dry-run` que solo loguea).
- [ ] **Step 5: Correr `node scripts/migrar-roles-app-metadata.mjs --dry-run`**
Expected: lista usuarios existentes y qué estamparía, sin escribir.
- [ ] **Step 6: Commit** — `git commit -m "feat(permisos): tabla usuarios_permisos + script migración roles"`

### Task 4: Helpers server-side de autorización

**Files:**
- Create: `lib/permisos-server.ts` (sin `'use server'`: helpers importados por actions)
- Test: smoke en Task 10 (tocan Supabase; la lógica decidible ya está testeada en Task 2)

**Interfaces:**
- Consumes: `createClient` de `@/lib/supabase/server`, `createAdminClient` de `@/lib/supabase/admin`, `puedeOperar`/`puedeVer` de Task 2.
- Produces:
  ```ts
  export type UsuarioActual = { userId: string; email: string; rol: string; superAdmin: boolean; activo: boolean; permisos: Permisos }
  export async function getUsuarioActual(): Promise<UsuarioActual | null>  // null sin sesión; rol de app_metadata; admin => superAdmin según fila (sin fila => false), permisos irrelevantes; restringido => fila via service role (sin fila => permisos {})
  export async function requierePermiso(seccion: string, subitem: string, nivel: NivelPermiso): Promise<void> // admin pasa; restringido sin permiso o inactivo => throw new Error('Sin permiso para esta acción')
  export async function requireSuperAdmin(): Promise<UsuarioActual> // throw new Error('Solo super admin') si no
  ```

- [ ] **Step 1: Implementar `lib/permisos-server.ts`** con las tres funciones.
- [ ] **Step 2: Verificar que compila** — `npx tsc --noEmit` (o `npm run build` si el repo no tiene script tsc)
Expected: sin errores nuevos.
- [ ] **Step 3: Commit** — `git commit -m "feat(permisos): helpers server requierePermiso/requireSuperAdmin"`

### Task 5: Middleware + aterrizaje + fin del rol visor en código

**Files:**
- Modify: `middleware.ts` (rama visor líneas ~50-58, bloque rutas admin ~60-74, redirect de /login ~36-41)
- Modify: `app/login/page.tsx:29-30`, `app/page.tsx`, `app/(consignatario)/layout.tsx`, `app/api/celia/chat/route.ts`, `lib/actions/celia.ts` (todos los lectores de `user_metadata.rol` → `app_metadata.rol`; encontrarlos con `grep -rn "user_metadata" app lib middleware.ts`)
- Create: `app/sin-acceso/page.tsx`

**Interfaces:**
- Consumes: `rutaPermitida`, `primeraRutaPermitida` (Task 2) — importables en middleware (puras, sin Node APIs).
- Produces: comportamiento — `rol='restringido'`: middleware lee su fila de `usuarios_permisos` con el client SSR del request (RLS permite leer la propia); `activo=false` o sin fila ⇒ tratar como permisos `{}`. Ruta no permitida ⇒ redirect a `primeraRutaPermitida` ⇒ si null, `/sin-acceso`. `/sin-acceso` y `/establecer-password` pasan para cualquier usuario logueado. La rama `rol === 'visor'` se ELIMINA (Victor ya será restringido vía Task 10). El bloque "Rutas admin" pasa a: `rol === 'admin'` pasa; `rol === 'restringido'` va por `rutaPermitida`; otro rol ⇒ redirect actual.

- [ ] **Step 1: Crear `app/sin-acceso/page.tsx`** — página simple: "No tenés accesos asignados. Contactá al administrador." + botón cerrar sesión (estilo del repo).
- [ ] **Step 2: Modificar `middleware.ts`** según Produces. El redirect de `/login` con sesión: `admin` → `/dashboard`, `restringido` → `/dashboard` (el propio middleware lo re-rutea), `consignatario` → `/mi-dashboard`.
- [ ] **Step 3: Migrar los lectores de `user_metadata.rol`** listados en Files a `app_metadata.rol`.
- [ ] **Step 4: Verificar build** — `npm run build`
Expected: compila sin errores.
- [ ] **Step 5: Verificar en dev** — `npm run dev` + login con cuenta admin real: navega como siempre (app_metadata aún sin estampar en local ⇒ si el usuario local no tiene `app_metadata.rol`, estamparlo a mano con un one-liner del script de Task 3 contra el proyecto, o verificar este paso recién tras Task 10 en prod — anotar cuál se hizo).
- [ ] **Step 6: Commit** — `git commit -m "feat(permisos): middleware restringido + app_metadata.rol, adiós visor"`

### Task 6: Sidebar dinámico + item Usuarios

**Files:**
- Modify: `app/(admin)/layout.tsx`
- Test: `__tests__/permisos.test.ts` (ampliar `filtrarNavItems` si hiciera falta; el layout en sí se verifica por build + dev)

**Interfaces:**
- Consumes: `getUsuarioActual` (Task 4), `filtrarNavItems` + `CATALOGO` (Tasks 1-2), `AdminNavItem` existente.
- Produces: layout admite `rol ∈ {admin, restringido}` (ya no visor). `admin` ⇒ `navItems` actuales; si además `superAdmin` ⇒ + item `{ href: '/usuarios', label: 'Usuarios y Permisos', icon: 'consignatarios' }`. `restringido` ⇒ items generados de `filtrarNavItems(permisos)` mapeando `SeccionCatalogo` → `AdminNavItem` (href/label/icon/external). `navItemsVisor` se elimina.

- [ ] **Step 1: Modificar el layout** según Produces (guard de entrada: `rol !== 'admin' && rol !== 'restringido'` ⇒ redirect `/login`).
- [ ] **Step 2: Build** — `npm run build` Expected: OK.
- [ ] **Step 3: Commit** — `git commit -m "feat(permisos): sidebar por permisos + item Usuarios"`

### Task 7: Finanzas — pestañas por permiso y Operar en escrituras

**Files:**
- Modify: `app/(admin)/finanzas/page.tsx` (array de tabs, líneas ~186-194)
- Modify: `lib/actions/finanzas.ts`, `lib/actions/deuda.ts`, `lib/actions/resultado.ts`, `lib/actions/productos.ts`
- Modify: `app/(admin)/finanzas/FlujoTab.tsx`, `DeudaTab.tsx` (prop `operar`), y el componente de egresos que renderice formularios (ubicarlo: `grep -n "agregarEgreso" app/(admin)/finanzas/*.tsx components -r`)

**Interfaces:**
- Consumes: `getUsuarioActual` (Task 4), `tabsPermitidas` (Task 2), `requierePermiso` (Task 4).
- Produces: mapa Operar pin (seccion `'finanzas'`):
  - subitem `'flujo'`: `agregarAsistencia`, `editarAsistencia`, `eliminarAsistencia`, `setProyeccionDiaria`, `setForecastEvents`, `setComprasDias`
  - `'egresos'`: `agregarEgreso`, `editarEgreso`, `eliminarEgreso`
  - `'deuda'`: `setDeudaConfig`, `crearPrestamo`, `cancelarPrestamo`, `devolverCapital`, `registrarInteres`
  - `'resultado'`: `updateConfig` (resultado.ts)
  - `'precios'`: `guardarProducto`, `eliminarProducto` (productos.ts)
  Cada una arranca con `await requierePermiso('finanzas', '<subitem>', 'operar')`.

- [ ] **Step 1: Agregar el guard a cada action del mapa** (una línea al inicio de cada función listada).
- [ ] **Step 2: Filtrar tabs en `page.tsx`** — obtener `usuario = await getUsuarioActual()`; si `rol==='restringido'`, construir el array solo con las tabs cuyo id ∈ `tabsPermitidas(usuario.permisos, 'finanzas', ids)`; para las excluidas, NO crear su JSX (los datos de pestañas sin permiso quedan fuera del payload). Los fetch exclusivos de una tab excluida se saltean cuando sea un `await` directo identificable (p. ej. `getDatosSimulador` si no hay `simulador`); los del `Promise.all` compartido quedan como están (no se serializan si la tab no se renderiza).
- [ ] **Step 3: Prop `operar` en tabs con accionables** — `FlujoTab`, `DeudaTab` y el componente de egresos reciben `operar: boolean` (admin ⇒ true) y esconden formularios/botones de escritura cuando es false.
- [ ] **Step 4: Tests existentes + build** — `npx vitest run` y `npm run build`
Expected: suite completa PASS, build OK.
- [ ] **Step 5: Commit** — `git commit -m "feat(permisos): finanzas con tabs por permiso y operar server-side"`

### Task 8: Panel /usuarios — listado, alta por invitación, activar/desactivar

**Files:**
- Create: `app/(admin)/usuarios/page.tsx`, `app/(admin)/usuarios/UsuariosTable.tsx` (cliente)
- Create: `lib/actions/usuarios.ts`
- Create: `app/auth/confirm/route.ts`, `app/establecer-password/page.tsx`
- Test: `__tests__/usuarios.test.ts` (lógica pura de resumen de accesos)

**Interfaces:**
- Consumes: `requireSuperAdmin`, `createAdminClient`, `emailPermitido`, `CATALOGO`.
- Produces (`lib/actions/usuarios.ts`, todas arrancan con `await requireSuperAdmin()`):
  ```ts
  export async function listarUsuarios(): Promise<FilaUsuario[]> // join listUsers (admin API) + usuarios_permisos; FilaUsuario = { userId, email, superAdmin, activo, invitacionPendiente: boolean /* email_confirmed_at null */, resumen: string }
  export async function crearUsuario(email: string): Promise<{ ok: true } | { ok: false; error: string }>
  export async function reinvitar(userId: string): Promise<void>
  export async function setActivo(userId: string, activo: boolean): Promise<void> // ban_duration '876000h' | 'none' + columna activo
  ```
  `crearUsuario`: valida `emailPermitido` (error: `"Solo mails @gocuotas.com"`); si el mail ya existe ⇒ `{ ok:false, error: 'Ese mail ya tiene usuario' }`; `inviteUserByEmail(email, { redirectTo: 'https://goabl.app/establecer-password' })` ⇒ `updateUserById(id, { app_metadata: { rol: 'restringido' } })` ⇒ insert fila `usuarios_permisos` (`permisos: {}`, `email`).
  Resumen de accesos: pura `resumenAccesos(permisos: Permisos): string` en `lib/permisos.ts` (ej. `"Finanzas (7) · Compras (2)"`, `"Todo"` para admin, `"Sin accesos"`) — testeada.
  Flujo invitación: `app/auth/confirm/route.ts` (GET con `token_hash`+`type`) llama `supabase.auth.verifyOtp({ type, token_hash })` (client SSR, setea cookies) y redirige a `/establecer-password`; esa página (cliente) pide contraseña x2 y llama `supabase.auth.updateUser({ password })`, luego `router.push('/')`. Agregar `/auth/confirm` al matcher-bypass igual que `/sin-acceso` si el middleware lo rebota.
- UI listado: tabla compacta estilo Finanzas — mail, estado (chip verde activo / gris inactivo / ámbar invitación pendiente), resumen de accesos, acciones: `Permisos` (link a `/usuarios/<id>`, Task 9), `Reinvitar` (solo pendientes), `Desactivar/Reactivar` (confirmación 2 pasos, patrón del repo). Botón `+ Nuevo usuario` → input mail + Invitar.

- [ ] **Step 1: Test de `resumenAccesos` (FAIL primero)** — `npx vitest run __tests__/usuarios.test.ts`
- [ ] **Step 2: Implementar `resumenAccesos` + verificar PASS**
- [ ] **Step 3: Implementar `lib/actions/usuarios.ts`** según Produces.
- [ ] **Step 4: Implementar page + tabla cliente** según UI.
- [ ] **Step 5: Implementar `app/auth/confirm/route.ts` + `app/establecer-password/page.tsx`.**
- [ ] **Step 6: Build + prueba dev** — `npm run build`; en dev, entrar a `/usuarios` como super admin (si local no tiene fila super_admin, insertarla a mano vía SQL y anotarlo) y probar: mail inválido (rechaza), @gocuotas.com nuevo (queda pendiente), y el MISMO mail otra vez (error "Ese mail ya tiene usuario", sin fila duplicada en `usuarios_permisos`).
- [ ] **Step 7: Commit** — `git commit -m "feat(permisos): panel /usuarios con alta por invitación"`

### Task 9: Ficha de permisos (editor Ver/Operar)

**Files:**
- Create: `app/(admin)/usuarios/[id]/page.tsx`, `app/(admin)/usuarios/[id]/EditorPermisos.tsx` (cliente)
- Modify: `lib/actions/usuarios.ts` (+2 actions)
- Test: `__tests__/usuarios.test.ts` (+ lógica pura de toggles)

**Interfaces:**
- Consumes: `CATALOGO`, `Permisos`, `requireSuperAdmin`.
- Produces:
  ```ts
  export async function getUsuario(userId: string): Promise<{ email: string; superAdmin: boolean; activo: boolean; permisos: Permisos }>
  export async function guardarPermisos(userId: string, permisos: Permisos): Promise<void> // valida contra CATALOGO: sección/subitem desconocido o 'operar' en subitem operar:false => throw
  ```
  Pura en `lib/permisos.ts`: `aplicarToggle(permisos, seccion, subitem, campo: 'ver' | 'operar'): Permisos` — tildar operar ⇒ guarda `'operar'`; destildar ver ⇒ borra el subitem; destildar operar ⇒ baja a `'ver'`; y `validarPermisos(permisos): string | null` (null = ok, usada por `guardarPermisos`).
- UI: el mockup aprobado (`.superpowers/brainstorm/233539-1792419075/content/modelo-permisos.html`): secciones desplegables (`<details>`), header con contador "N subitems habilitados" + enlaces "todo / nada" por sección, filas subitem con checkbox Ver y Operar (Operar deshabilitado si el subitem es `operar: false`), botón Guardar sticky al pie (optimista no: guarda explícito con feedback).

- [ ] **Step 1: Tests de `aplicarToggle` y `validarPermisos` (FAIL)** — casos: operar tilda ver solo; destildar ver borra; operar sobre subitem `operar:false` inválido.
- [ ] **Step 2: Implementar ambas y verificar PASS** — `npx vitest run __tests__/usuarios.test.ts`
- [ ] **Step 3: Implementar actions `getUsuario`/`guardarPermisos`.**
- [ ] **Step 4: Implementar la ficha + editor cliente.**
- [ ] **Step 5: Build + dev** — editar permisos del usuario de prueba de Task 8: dejar solo Finanzas sin `simulador`, guardar, recargar y ver que persiste.
- [ ] **Step 6: Commit** — `git commit -m "feat(permisos): editor de permisos por usuario"`

### Task 10: Migración en prod, deploy y smoke E2E

**Files:**
- Modify: ninguno nuevo (corre scripts y deploy)
- Modify: `docs/superpowers/specs/2026-10-19-usuarios-permisos-design.md` (marcar estado: implementado)

**Interfaces:**
- Consumes: scripts de Task 3, todo lo anterior mergeado en `master`.

- [ ] **Step 1: Correr el SQL en prod si no se corrió en Task 3** (misma verificación del deny anon).
- [ ] **Step 2: Correr `node scripts/migrar-roles-app-metadata.mjs` (sin dry-run) contra prod.**
Expected: todos los usuarios con `app_metadata.rol`; Victor restringido con sus 3 secciones; Emiliano con `super_admin=true`.
- [ ] **Step 3: Deploy** — `npx vercel --prod` (cuenta abl-art). Verificar `SUPABASE_SERVICE_ROLE_KEY` presente en env de Vercel production antes del deploy (`npx vercel env ls production`).
- [ ] **Step 4: Smoke como admin** — login Emiliano en goabl.app: sidebar completo + item "Usuarios y Permisos"; /finanzas intacta con las 9 tabs.
- [ ] **Step 5: Smoke como Victor (restringido)** — cookie por password grant (patrón del repo: `sb-<ref>-auth-token = 'base64-'+base64url(password grant)`): `/dashboard` 200, `/finanzas` redirect, sidebar de 3 items.
- [ ] **Step 6: Smoke consignatario** — login consignatario@gocelular.com / GoConsig2026! → aterriza en `/mi-dashboard` como siempre (Review Focus #5).
- [ ] **Step 7: Smoke guard de escritura** — con la sesión de Victor, invocar `agregarEgreso` vía curl al endpoint de la server action (o en dev con su cookie): debe fallar con "Sin permiso".
- [ ] **Step 8: Alta real** — Emiliano crea desde /usuarios al usuario de adm y finanzas (mail @gocuotas.com), tilda Finanzas completa Ver+Operar (9 pestañas), la persona recibe el mail, setea contraseña, loguea y ve SOLO Finanzas. Confirmar con Emiliano antes de cerrar.
- [ ] **Step 9: Commit final + push** — actualizar la spec (estado), `git push`.
