# Usuarios y Permisos — diseño

**Fecha:** 2026-10-19 · **Decisor:** Emiliano Canova · **Estado:** borrador para aprobación

## Intención y porqué

GOcelular360 hoy tiene un solo nivel real de acceso interno: admin ve todo. El único matiz es el rol `visor` (Victor Kislo), hardcodeado en el middleware y el layout. Se vienen sumando usuarios internos (adm y finanzas primero, más después) y Emiliano no quiere que todos vean y operen todo, ni depender de un desarrollador para cada alta o cambio de permisos.

Se construye un **panel de administración de usuarios** dentro de la app: un super admin da de alta usuarios y configura, por persona, qué secciones/submenús ve y cuáles opera. El primer caso real: una persona de adm y finanzas que entra a goabl.app, se loguea, y ve únicamente la sección Finanzas completa (las 9 pestañas, con capacidad de operar: tomar préstamo, cargar egreso, etc.).

## Objetivos

- Panel `/usuarios` (nombre de ruta a criterio del builder) visible solo para super admins: listado, alta, edición de permisos, desactivación.
- Alta solo desde el panel. **No existe registro público.** El mail debe ser dominio `@gocuotas.com`; cualquier otro dominio se rechaza con mensaje claro.
- Al dar de alta, la persona recibe un **mail de invitación** y elige su propia contraseña (Supabase `inviteUserByEmail`).
- Permisos **por persona** (decisión explícita de Emiliano: ad hoc a cada función; NO hay roles/plantillas intermedias).
- Granularidad: cada **sección** del sidebar, y adentro cada **submenú/pestaña**, con dos tildes: **Ver** y **Operar**. Operar implica Ver. Sin tilde = esa pantalla no existe para la persona: no aparece en sidebar/tabs y tipear la URL rebota a su primera sección permitida.
  - Ejemplo canónico de Emiliano: en Finanzas se listan las 9 pestañas (Flujo de fondos, Egresos, Deuda, Payment Defaults, Days Past Due, Vintage, Simulación, Productos, Resultado); si Simulación queda sin tildes, esa persona no la ve ni la opera.
- "Operar" cubre los accionables de la pantalla (cargar egreso, tomar préstamo, hacer pedido, resolver envío, cargar comprobante…). Regla general: Ver/Operar por submenú. Excepciones finas (partir los accionables de una misma pantalla en grupos) solo donde importe de verdad; no se exige catálogo por accionable individual en toda la app.
- **Enforcement en servidor, no solo UI**: Ver se controla en el middleware por ruta y en el server component para pestañas dentro de una misma página (en Finanzas, los datos de pestañas sin permiso se excluyen del payload que llega al navegador, no solo el tab); Operar (escrituras) se controla dentro de las server actions / API routes de las secciones cubiertas. Hoy las server actions no chequean rol (hueco conocido del visor): este proyecto lo cierra para las escrituras bajo el sistema de permisos.
- **Alcance de Ver decidido por Emiliano (19/10, pregunta del revisor):** en v1 Ver protege pantallas y navegación, NO las funciones de lectura de datos — un usuario interno con conocimientos técnicos podría invocar fetch actions de secciones que no ve desde la consola. Riesgo aceptado explícitamente para v1 (usuarios internos @gocuotas.com); blindar lecturas queda como mejora gradual posterior, NO es parte de este proyecto.
- Super admin es un flag del usuario: acceso total a todo + gestión de usuarios. **Único super admin inicial: Emiliano (emiliano.canova@gocuotas.com)** — decidido 19/10: las demás cuentas admin existentes conservan su acceso total a la app como hoy, pero NO ven el panel de Usuarios ni pueden dar altas o cambiar permisos. Sumar otro super admin a futuro = tildar el flag desde el panel.
- Migrar a Victor (visor) al sistema nuevo con exactamente su acceso actual (Dashboard360, Alertas y Fraudes, Venta a Terceros, solo Ver), y eliminar el mecanismo `rol='visor'` hardcodeado.
- Entregable final incluye **crear el primer usuario real de adm y finanzas** con Finanzas completa en Ver + Operar y nada más.

## No-objetivos

- Registro público o login social (Google OAuth): no.
- Tipos de usuario / plantillas de rol: no en v1 (los permisos son por persona; si algún día duele, se agrega encima).
- Tocar el portal de consignatarios (`rol='consignatario'`, rutas /mi-dashboard, /stock, etc.): queda intacto, incluidas sus cuentas con dominios no-gocuotas.
- Auditoría de acciones (quién hizo qué): no en v1.
- Permisos a nivel de dato/campo (ej. "ve Finanzas pero sin montos"): no.

## Anti-objetivos (fallas aunque "funcione")

- Que un usuario restringido pueda ejecutar una acción de escritura invocando la server action / endpoint directamente aunque la UI se la esconda. La UI escondida sin chequeo server-side NO cumple.
- Que un cambio de permisos tarde en aplicar de forma indefinida (ej. quedar cacheado en un JWT por horas sin invalidación). Sacarle un permiso a alguien tiene que aplicar en minutos como mucho.
- Que el alta acepte un mail fuera de `@gocuotas.com` por cualquier camino del panel.
- Romper el login o el alcance actual de los admins existentes y consignatarios.

## Restricciones

- Stack existente: Next.js 14 (App Router) + Supabase Auth + middleware.ts con `user_metadata.rol` ∈ {admin, visor, consignatario}. Conviven goabl.app y gocelular360.vercel.app.
- El middleware corre en cada request; cualquier lookup de permisos ahí debe ser barato (ver "Cómo", abajo).
- Patrón del repo: tablas Supabase sin RLS, el chequeo de sesión vive en actions/API routes; lógica pura testeada en `lib/` (seguir ese patrón para la lógica de permisos).
- El mail de invitación de Supabase debe llegar a casillas @gocuotas.com (Google Workspace). Verificar configuración SMTP/plantilla del proyecto Supabase `rnjxmmcsxmyaktseegvt` antes de dar por bueno el circuito.

## El cómo, en lo ya decidido

- **Modelo de datos (llamada del asistente, ajustable por el builder):** tabla `usuarios_permisos` en Supabase como fuente de verdad: `user_id` (uuid, PK), `super_admin` boolean, `activo` boolean, `permisos` jsonb (`{ "<seccion>": { "<subitem>": "ver" | "operar" } }`), timestamps. Los usuarios del panel llevan rol `'restringido'`; el middleware solo consulta permisos para ese rol; admins plenos y consignatarios siguen su camino actual sin costo extra. Si la consulta por request resulta cara, el builder puede cachear con TTL corto (≤5 min) — nunca en el JWT sin invalidación (ver anti-objetivos).
- **El rol vive en `app_metadata`, no en `user_metadata` (llamada del asistente, hallazgo del revisor):** `user_metadata` es editable por el propio usuario desde el navegador con la anon key (`supabase.auth.updateUser`) — un restringido podría auto-ascenderse a admin. El rol que decide permisos se lee de `app_metadata.rol` (solo modificable con service role). Migración incluida: estampar `app_metadata.rol` a todos los usuarios existentes (admins, consignatarios, Victor) vía admin API; el middleware deja de confiar en `user_metadata.rol` para rutas admin. Esto cierra de paso el hueco preexistente del visor.
- **`usuarios_permisos` con RLS deny-all (llamada del asistente, excepción explícita al patrón "sin RLS" del repo):** una tabla de permisos sin RLS sería escribible por cualquier usuario logueado vía PostgREST con la anon key (podría ponerse `super_admin=true` solo). Esta tabla se accede únicamente con service role desde el servidor. El resto de las tablas del repo no cambia.
- **Catálogo de permisos:** registry estático en código (`lib/permisos-catalogo.ts`): lista de secciones → subitems, cada subitem con su ruta (o id de pestaña) y si admite Operar. El panel de permisos se dibuja desde el catálogo; el middleware y las actions lo consultan. Toda pantalla nueva que deba ser permisable se suma al catálogo (documentarlo en el repo).
- **Subitems por sección:** en secciones tipo hub con tarjetas (/compras, /canales, /inventario…), subitem = subruta; en páginas con pestañas (Finanzas con `?tab=`), subitem = pestaña, filtrado en el server component antes de renderizar. Enumeración completa del catálogo: a criterio del builder recorriendo el sidebar actual (incluye links externos del sidebar como subitems solo-Ver).
- **Alcance v1 del catálogo:** TODO el sidebar admin queda permisable a nivel Ver (sección/submenú). El chequeo server-side de **Operar** en actions se implementa completo para Finanzas (primer usuario real) y queda el patrón/helper listo (`requierePermiso(seccion, subitem, 'operar')`) para ir cubriendo el resto de las secciones a medida que se asignen usuarios. (Llamada del asistente para acotar el v1; el enforcement de Ver sí es total desde el día uno.)
- **UX del panel:** dos vistas — listado (mail, estado activo/invitación pendiente, resumen de accesos, botón reinvitar) y ficha de permisos (secciones desplegables con tildes Ver/Operar por subitem, como el mockup aprobado en el brainstorming; los mockups quedaron en `.superpowers/brainstorm/`). Header del editor con "marcar todo / nada" por sección. Usuario desactivado: no puede loguear (ban via Supabase admin API) y queda gris en el listado.
- **Login y aterrizaje:** un restringido que loguea aterriza en su primera sección permitida (orden del catálogo). Ruta no permitida → redirect a esa misma. Si no tiene ningún permiso: pantalla "sin accesos, contactá al administrador".
- **Validación de dominio:** en la server action de alta (no solo en el form). Lista de dominios permitidos como constante (`['gocuotas.com']`) para poder sumar dominios a futuro sin rediseño.

## Qué queda al builder

- Enumeración exacta del catálogo de secciones/subitems recorriendo el sidebar y las páginas actuales.
- Detalles del esquema SQL, naming de rutas del panel, componentes y organización de archivos (seguir patrones del repo: lógica pura testeada en `lib/permisos.ts`, actions en `lib/actions/usuarios.ts`).
- Mecánica exacta de invitación/reinvitación y expiración del link de Supabase.
- Cómo presentar "Operar implica Ver" en la UI (auto-tildar Ver al tildar Operar, etc.).
- Estrategia de tests (unit para lógica pura de permisos + smoke autenticado en prod como acostumbra el repo).
