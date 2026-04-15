# Consignación App — Plan 1: Fundación + Admin Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la base completa del proyecto y el panel admin con las funcionalidades core: gestión de dispositivos (con carga masiva por CSV), consignatarios, y el flujo de asignación de stock con firma digital y generación de PDF.

**Architecture:** Next.js 14 App Router con grupos de rutas `(admin)` y `(consignatario)`, Supabase para DB + Auth + Storage, middleware para protección de rutas por rol. Todos los componentes de servidor usan el Supabase server client; los de cliente usan el browser client.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (PostgreSQL + Auth + Storage + RLS), @supabase/ssr, react-signature-canvas, @react-pdf/renderer, papaparse (CSV), Vitest + Testing Library, Playwright (E2E)

---

## Estructura de archivos

```
consignacion-app/
├── app/
│   ├── (admin)/
│   │   ├── layout.tsx               — Nav sidebar admin
│   │   ├── dashboard/page.tsx       — KPIs globales
│   │   ├── inventario/
│   │   │   ├── page.tsx             — Lista dispositivos con filtros
│   │   │   └── ImportarCSV.tsx      — Componente carga masiva
│   │   ├── modelos/page.tsx         — CRUD modelos + multiplicador
│   │   ├── consignatarios/
│   │   │   ├── page.tsx             — Lista consignatarios
│   │   │   └── [id]/page.tsx        — Detalle: stock, historial, deudas
│   │   └── asignar/
│   │       ├── page.tsx             — Paso 1: selección consignatario + IMEIs
│   │       └── FirmaModal.tsx       — Paso 2: canvas firma + confirmación
│   ├── login/page.tsx               — Login con Supabase Auth
│   ├── layout.tsx                   — Root layout
│   ├── page.tsx                     — Redirect según rol
│   └── middleware.ts                — Protección de rutas por rol
├── components/
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Table.tsx
│       ├── Badge.tsx
│       └── Modal.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                — Browser client (singleton)
│   │   ├── server.ts                — Server client (cookies)
│   │   └── admin.ts                 — Service role client (solo server)
│   ├── pdf/
│   │   └── remito.tsx               — Componente @react-pdf/renderer para asignaciones
│   ├── types.ts                     — Tipos TypeScript de todas las entidades
│   └── utils.ts                     — Helpers: formatear moneda, validar IMEI, primer día hábil
├── supabase/
│   └── schema.sql                   — Schema completo con RLS
├── __tests__/
│   ├── utils.test.ts
│   ├── csv-import.test.ts
│   └── asignacion.test.ts
├── e2e/
│   ├── login.spec.ts
│   └── asignacion.spec.ts
├── vercel.json                      — Cron jobs (Plan 2)
├── next.config.js
├── tailwind.config.ts
└── vitest.config.ts
```

---

## Task 1: Inicializar proyecto Next.js 14

**Files:**
- Create: `package.json`, `next.config.js`, `tailwind.config.ts`, `tsconfig.json`, `vitest.config.ts`

- [ ] **Step 1: Crear el proyecto**

```bash
cd /home/cremi/consignacion-app
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
```

Expected: proyecto creado con estructura App Router.

- [ ] **Step 2: Instalar dependencias**

```bash
npm install @supabase/supabase-js @supabase/ssr react-signature-canvas papaparse
npm install @react-pdf/renderer
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
npm install -D @playwright/test
npm install -D @types/react-signature-canvas @types/papaparse
```

- [ ] **Step 3: Configurar Vitest**

Crear `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
```

Crear `vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Configurar variables de entorno**

Crear `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<tu-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>
GOCELULAR_DB_URL=<pendiente-credenciales>
```

Crear `.env.example` (sin valores reales):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOCELULAR_DB_URL=
```

- [ ] **Step 5: Commit inicial**

```bash
git add -A
git commit -m "feat: init Next.js 14 project with Supabase and testing setup"
```

---

## Task 2: Schema de base de datos Supabase

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Escribir schema completo**

Crear `supabase/schema.sql`:

```sql
-- Extensiones
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type estado_dispositivo as enum ('disponible', 'asignado', 'vendido', 'devuelto');
create type estado_auditoria as enum ('borrador', 'confirmada');
create type tipo_diferencia as enum ('faltante', 'sobrante');
create type estado_diferencia as enum ('pendiente', 'cobrado', 'resuelto');

-- ============================================================
-- CONFIG (una sola fila)
-- ============================================================
create table config (
  id uuid primary key default uuid_generate_v4(),
  multiplicador numeric not null default 1.8,
  updated_at timestamptz not null default now()
);
insert into config (multiplicador) values (1.8);

-- ============================================================
-- CONSIGNATARIOS
-- ============================================================
create table consignatarios (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  owner_id text,
  store_id text,
  email text unique not null,
  telefono text,
  punto_reorden integer not null default 10,
  comision_porcentaje numeric not null default 0.10,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- MODELOS
-- ============================================================
create table modelos (
  id uuid primary key default uuid_generate_v4(),
  marca text not null,
  modelo text not null,
  precio_costo numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(marca, modelo)
);

-- ============================================================
-- DISPOSITIVOS
-- ============================================================
create table dispositivos (
  id uuid primary key default uuid_generate_v4(),
  imei text unique not null,
  modelo_id uuid not null references modelos(id),
  estado estado_dispositivo not null default 'disponible',
  consignatario_id uuid references consignatarios(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ASIGNACIONES
-- ============================================================
create table asignaciones (
  id uuid primary key default uuid_generate_v4(),
  consignatario_id uuid not null references consignatarios(id),
  fecha date not null default current_date,
  total_unidades integer not null,
  total_valor_costo numeric not null,
  total_valor_venta numeric not null,
  firmado_por text not null,
  firma_url text not null,
  documento_url text,
  created_at timestamptz not null default now()
);

create table asignacion_items (
  id uuid primary key default uuid_generate_v4(),
  asignacion_id uuid not null references asignaciones(id) on delete cascade,
  dispositivo_id uuid not null references dispositivos(id)
);

-- ============================================================
-- VENTAS
-- ============================================================
create table ventas (
  id uuid primary key default uuid_generate_v4(),
  dispositivo_id uuid not null references dispositivos(id),
  consignatario_id uuid not null references consignatarios(id),
  fecha_venta date not null,
  precio_venta numeric not null,
  comision_monto numeric not null,
  gocelular_sale_id text unique,
  synced_at timestamptz not null default now()
);

-- ============================================================
-- AUDITORIAS
-- ============================================================
create table auditorias (
  id uuid primary key default uuid_generate_v4(),
  consignatario_id uuid not null references consignatarios(id),
  realizada_por text not null,
  fecha date not null default current_date,
  estado estado_auditoria not null default 'borrador',
  firma_url text,
  documento_url text,
  observaciones text,
  created_at timestamptz not null default now()
);

create table auditoria_items (
  id uuid primary key default uuid_generate_v4(),
  auditoria_id uuid not null references auditorias(id) on delete cascade,
  dispositivo_id uuid not null references dispositivos(id),
  presente boolean not null default false,
  observacion text
);

-- ============================================================
-- DIFERENCIAS
-- ============================================================
create table diferencias (
  id uuid primary key default uuid_generate_v4(),
  auditoria_id uuid not null references auditorias(id),
  dispositivo_id uuid not null references dispositivos(id),
  tipo tipo_diferencia not null,
  estado estado_diferencia not null default 'pendiente',
  monto_deuda numeric not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- FUNCIÓN: calcular diferencias al confirmar auditoría
-- ============================================================
create or replace function calcular_diferencias_auditoria(p_auditoria_id uuid)
returns void as $$
declare
  v_consignatario_id uuid;
  v_multiplicador numeric;
  v_dispositivo record;
begin
  select consignatario_id into v_consignatario_id
  from auditorias where id = p_auditoria_id;

  select multiplicador into v_multiplicador from config limit 1;

  -- Dispositivos asignados al consignatario que NO están presentes en auditoría
  -- y NO fueron vendidos
  for v_dispositivo in
    select d.id as dispositivo_id, m.precio_costo
    from dispositivos d
    join modelos m on m.id = d.modelo_id
    where d.consignatario_id = v_consignatario_id
      and d.estado = 'asignado'
      and d.id not in (
        select dispositivo_id from auditoria_items
        where auditoria_id = p_auditoria_id and presente = true
      )
  loop
    insert into diferencias (auditoria_id, dispositivo_id, tipo, estado, monto_deuda)
    values (
      p_auditoria_id,
      v_dispositivo.dispositivo_id,
      'faltante',
      'pendiente',
      v_dispositivo.precio_costo * v_multiplicador
    );
  end loop;

  -- Marcar auditoría como confirmada
  update auditorias set estado = 'confirmada' where id = p_auditoria_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- RLS
-- ============================================================
alter table config enable row level security;
alter table consignatarios enable row level security;
alter table modelos enable row level security;
alter table dispositivos enable row level security;
alter table asignaciones enable row level security;
alter table asignacion_items enable row level security;
alter table ventas enable row level security;
alter table auditorias enable row level security;
alter table auditoria_items enable row level security;
alter table diferencias enable row level security;

-- Admin: acceso total (rol 'admin' en user_metadata)
create policy "admin_all" on config for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on consignatarios for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on modelos for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on dispositivos for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on asignaciones for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on asignacion_items for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on ventas for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on auditorias for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on auditoria_items for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

create policy "admin_all" on diferencias for all
  using (auth.jwt() ->> 'user_metadata'::text like '%"rol":"admin"%');

-- Consignatario: solo sus propios registros
create policy "consignatario_select_self" on consignatarios for select
  using (user_id = auth.uid());

create policy "consignatario_select_dispositivos" on dispositivos for select
  using (
    consignatario_id in (
      select id from consignatarios where user_id = auth.uid()
    )
  );

create policy "consignatario_select_asignaciones" on asignaciones for select
  using (
    consignatario_id in (
      select id from consignatarios where user_id = auth.uid()
    )
  );

create policy "consignatario_select_asignacion_items" on asignacion_items for select
  using (
    asignacion_id in (
      select id from asignaciones where consignatario_id in (
        select id from consignatarios where user_id = auth.uid()
      )
    )
  );

create policy "consignatario_select_ventas" on ventas for select
  using (
    consignatario_id in (
      select id from consignatarios where user_id = auth.uid()
    )
  );

create policy "consignatario_select_auditorias" on auditorias for select
  using (
    consignatario_id in (
      select id from consignatarios where user_id = auth.uid()
    )
  );

create policy "consignatario_select_diferencias" on diferencias for select
  using (
    auditoria_id in (
      select id from auditorias where consignatario_id in (
        select id from consignatarios where user_id = auth.uid()
      )
    )
  );

create policy "consignatario_select_modelos" on modelos for select
  using (true);

create policy "consignatario_select_config" on config for select
  using (true);
```

- [ ] **Step 2: Aplicar schema en Supabase**

En el dashboard de Supabase → SQL Editor, ejecutar el contenido de `supabase/schema.sql`.

Expected: todas las tablas creadas sin errores.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add complete Supabase schema with RLS"
```

---

## Task 3: Clientes Supabase + Tipos TypeScript

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`
- Create: `lib/types.ts`

- [ ] **Step 1: Crear `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Crear `lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}
```

- [ ] **Step 3: Crear `lib/supabase/admin.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

// Solo usar server-side — nunca en componentes cliente
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 4: Crear `lib/types.ts`**

```typescript
export type EstadoDispositivo = 'disponible' | 'asignado' | 'vendido' | 'devuelto'
export type EstadoAuditoria = 'borrador' | 'confirmada'
export type TipoDiferencia = 'faltante' | 'sobrante'
export type EstadoDiferencia = 'pendiente' | 'cobrado' | 'resuelto'

export interface Config {
  id: string
  multiplicador: number
  updated_at: string
}

export interface Consignatario {
  id: string
  nombre: string
  owner_id: string | null
  store_id: string | null
  email: string
  telefono: string | null
  punto_reorden: number
  comision_porcentaje: number
  user_id: string | null
  created_at: string
}

export interface Modelo {
  id: string
  marca: string
  modelo: string
  precio_costo: number
  created_at: string
}

// precio_venta es calculado: precio_costo * config.multiplicador
export interface ModeloConPrecioVenta extends Modelo {
  precio_venta: number
}

export interface Dispositivo {
  id: string
  imei: string
  modelo_id: string
  estado: EstadoDispositivo
  consignatario_id: string | null
  created_at: string
}

export interface DispositivoConModelo extends Dispositivo {
  modelos: Modelo
}

export interface Asignacion {
  id: string
  consignatario_id: string
  fecha: string
  total_unidades: number
  total_valor_costo: number
  total_valor_venta: number
  firmado_por: string
  firma_url: string
  documento_url: string | null
  created_at: string
}

export interface AsignacionItem {
  id: string
  asignacion_id: string
  dispositivo_id: string
}

export interface Venta {
  id: string
  dispositivo_id: string
  consignatario_id: string
  fecha_venta: string
  precio_venta: number
  comision_monto: number
  gocelular_sale_id: string | null
  synced_at: string
}

export interface Auditoria {
  id: string
  consignatario_id: string
  realizada_por: string
  fecha: string
  estado: EstadoAuditoria
  firma_url: string | null
  documento_url: string | null
  observaciones: string | null
  created_at: string
}

export interface AuditoriaItem {
  id: string
  auditoria_id: string
  dispositivo_id: string
  presente: boolean
  observacion: string | null
}

export interface Diferencia {
  id: string
  auditoria_id: string
  dispositivo_id: string
  tipo: TipoDiferencia
  estado: EstadoDiferencia
  monto_deuda: number
  created_at: string
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/
git commit -m "feat: add Supabase clients and TypeScript types"
```

---

## Task 4: Auth — Login + Middleware

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/middleware.ts`
- Create: `app/page.tsx`

- [ ] **Step 1: Crear `app/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    const rol = data.user?.user_metadata?.rol
    router.push(rol === 'admin' ? '/dashboard' : '/stock')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">GOcelular</h1>
        <p className="text-sm text-gray-500 mb-8">Sistema de consignación</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear `middleware.ts`** (en la raíz del proyecto, no dentro de `app/`)

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rutas públicas
  if (pathname === '/login') {
    if (user) {
      const rol = user.user_metadata?.rol
      return NextResponse.redirect(new URL(rol === 'admin' ? '/dashboard' : '/stock', request.url))
    }
    return supabaseResponse
  }

  // Sin sesión → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const rol = user.user_metadata?.rol

  // Rutas admin: solo admins
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/inventario') ||
      pathname.startsWith('/modelos') || pathname.startsWith('/consignatarios') ||
      pathname.startsWith('/asignar') || pathname.startsWith('/auditorias') ||
      pathname.startsWith('/diferencias') || pathname.startsWith('/sync') ||
      pathname.startsWith('/reportes')) {
    if (rol !== 'admin') {
      return NextResponse.redirect(new URL('/stock', request.url))
    }
  }

  // Rutas consignatario: solo consignatarios
  if (pathname.startsWith('/stock') || pathname.startsWith('/ventas') ||
      pathname.startsWith('/comisiones') || pathname.startsWith('/recibos')) {
    if (rol !== 'consignatario') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

- [ ] **Step 3: Crear `app/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const rol = user.user_metadata?.rol
  redirect(rol === 'admin' ? '/dashboard' : '/stock')
}
```

- [ ] **Step 4: Commit**

```bash
git add app/login/ app/page.tsx middleware.ts
git commit -m "feat: add auth login page and middleware with role-based routing"
```

---

## Task 5: Utils + tests

**Files:**
- Create: `lib/utils.ts`
- Create: `__tests__/utils.test.ts`

- [ ] **Step 1: Escribir tests primero**

Crear `__tests__/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validarIMEI, formatearMoneda, calcularPrecioVenta, primerDiaHabil } from '@/lib/utils'

describe('validarIMEI', () => {
  it('acepta IMEI de 15 dígitos numéricos', () => {
    expect(validarIMEI('123456789012345')).toBe(true)
  })

  it('rechaza IMEI con letras', () => {
    expect(validarIMEI('12345678901234A')).toBe(false)
  })

  it('rechaza IMEI con menos de 15 dígitos', () => {
    expect(validarIMEI('12345678901234')).toBe(false)
  })

  it('rechaza IMEI con más de 15 dígitos', () => {
    expect(validarIMEI('1234567890123456')).toBe(false)
  })

  it('rechaza string vacío', () => {
    expect(validarIMEI('')).toBe(false)
  })
})

describe('formatearMoneda', () => {
  it('formatea número como pesos argentinos', () => {
    expect(formatearMoneda(1234.5)).toMatch(/1\.234/)
  })

  it('formatea cero', () => {
    expect(formatearMoneda(0)).toMatch(/0/)
  })
})

describe('calcularPrecioVenta', () => {
  it('multiplica precio_costo por multiplicador', () => {
    expect(calcularPrecioVenta(100, 1.8)).toBe(180)
  })

  it('maneja multiplicador 1', () => {
    expect(calcularPrecioVenta(200, 1)).toBe(200)
  })
})

describe('primerDiaHabil', () => {
  it('retorna el 2 si el 1 es domingo', () => {
    // 2023-01-01 era domingo
    const result = primerDiaHabil(2023, 0) // enero 2023
    expect(result.getDate()).toBe(2)
  })

  it('retorna el 3 si el 1 es sábado', () => {
    // 2022-01-01 era sábado
    const result = primerDiaHabil(2022, 0) // enero 2022
    expect(result.getDate()).toBe(3)
  })

  it('retorna el 1 si el 1 es lunes', () => {
    // 2024-01-01 era lunes
    const result = primerDiaHabil(2024, 0) // enero 2024
    expect(result.getDate()).toBe(1)
  })
})
```

- [ ] **Step 2: Correr tests — verificar que fallan**

```bash
npx vitest run __tests__/utils.test.ts
```

Expected: FAIL — `utils` not found.

- [ ] **Step 3: Implementar `lib/utils.ts`**

```typescript
export function validarIMEI(imei: string): boolean {
  return /^\d{15}$/.test(imei)
}

export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(monto)
}

export function calcularPrecioVenta(precioCosto: number, multiplicador: number): number {
  return precioCosto * multiplicador
}

export function primerDiaHabil(year: number, month: number): Date {
  const date = new Date(year, month, 1)
  // 0 = domingo, 6 = sábado
  if (date.getDay() === 0) date.setDate(2)
  else if (date.getDay() === 6) date.setDate(3)
  return date
}
```

- [ ] **Step 4: Correr tests — verificar que pasan**

```bash
npx vitest run __tests__/utils.test.ts
```

Expected: PASS (4 suites, todos en verde).

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts __tests__/utils.test.ts
git commit -m "feat: add utils (validarIMEI, formatearMoneda, calcularPrecioVenta, primerDiaHabil)"
```

---

## Task 6: Layout admin + navegación

**Files:**
- Create: `app/(admin)/layout.tsx`

- [ ] **Step 1: Crear `app/(admin)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/inventario', label: 'Inventario' },
  { href: '/asignar', label: 'Asignar stock' },
  { href: '/consignatarios', label: 'Consignatarios' },
  { href: '/modelos', label: 'Modelos y precios' },
  { href: '/auditorias', label: 'Auditorías' },
  { href: '/diferencias', label: 'Diferencias' },
  { href: '/reportes', label: 'Reportes' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.user_metadata?.rol !== 'admin') redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <span className="text-lg font-bold text-gray-900">GOcelular</span>
          <span className="text-xs text-gray-400 block">Panel Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Crear route handler para sign out en `app/api/auth/signout/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function POST() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/ app/api/auth/
git commit -m "feat: add admin layout with sidebar navigation"
```

---

## Task 7: Modelos y multiplicador

**Files:**
- Create: `app/(admin)/modelos/page.tsx`

- [ ] **Step 1: Crear `app/(admin)/modelos/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { formatearMoneda, calcularPrecioVenta } from '@/lib/utils'
import type { Modelo, Config } from '@/lib/types'

async function actualizarMultiplicador(formData: FormData) {
  'use server'
  const supabase = createClient()
  const multiplicador = parseFloat(formData.get('multiplicador') as string)
  if (isNaN(multiplicador) || multiplicador <= 0) return
  await supabase.from('config').update({ multiplicador, updated_at: new Date().toISOString() }).neq('id', '')
  revalidatePath('/modelos')
}

async function crearModelo(formData: FormData) {
  'use server'
  const supabase = createClient()
  const marca = (formData.get('marca') as string).trim()
  const modelo = (formData.get('modelo') as string).trim()
  const precio_costo = parseFloat(formData.get('precio_costo') as string)
  if (!marca || !modelo || isNaN(precio_costo)) return
  await supabase.from('modelos').insert({ marca, modelo, precio_costo })
  revalidatePath('/modelos')
}

async function eliminarModelo(id: string) {
  'use server'
  const supabase = createClient()
  await supabase.from('modelos').delete().eq('id', id)
  revalidatePath('/modelos')
}

export default async function ModelosPage() {
  const supabase = createClient()
  const [{ data: config }, { data: modelos }] = await Promise.all([
    supabase.from('config').select('*').single<Config>(),
    supabase.from('modelos').select('*').order('marca').returns<Modelo[]>(),
  ])

  const multiplicador = config?.multiplicador ?? 1.8

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Modelos y precios</h1>

      {/* Multiplicador global */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Multiplicador global de precio
        </h2>
        <form action={actualizarMultiplicador} className="flex items-end gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Multiplicador actual: <strong>{multiplicador}</strong>
            </label>
            <input
              name="multiplicador"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={multiplicador}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Actualizar
          </button>
        </form>
      </div>

      {/* Agregar modelo */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Agregar modelo
        </h2>
        <form action={crearModelo} className="flex gap-3 flex-wrap">
          <input
            name="marca"
            placeholder="Marca (ej: Samsung)"
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40"
          />
          <input
            name="modelo"
            placeholder="Modelo (ej: A54)"
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
          />
          <input
            name="precio_costo"
            type="number"
            step="0.01"
            min="0"
            placeholder="Precio costo"
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-36"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
          >
            Agregar
          </button>
        </form>
      </div>

      {/* Lista de modelos */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Marca</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio costo</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Precio venta</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {modelos?.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 text-gray-900">{m.marca}</td>
                <td className="px-6 py-3 text-gray-900">{m.modelo}</td>
                <td className="px-6 py-3 text-right text-gray-700">{formatearMoneda(m.precio_costo)}</td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">
                  {formatearMoneda(calcularPrecioVenta(m.precio_costo, multiplicador))}
                </td>
                <td className="px-6 py-3 text-right">
                  <form action={eliminarModelo.bind(null, m.id)}>
                    <button type="submit" className="text-red-500 hover:text-red-700 text-xs">
                      Eliminar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!modelos || modelos.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  No hay modelos cargados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/modelos/
git commit -m "feat: add modelos page with multiplicador config and CRUD"
```

---

## Task 8: Consignatarios — lista y detalle

**Files:**
- Create: `app/(admin)/consignatarios/page.tsx`
- Create: `app/(admin)/consignatarios/[id]/page.tsx`

- [ ] **Step 1: Crear `app/(admin)/consignatarios/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { formatearMoneda } from '@/lib/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Consignatario } from '@/lib/types'

async function crearConsignatario(formData: FormData) {
  'use server'
  const nombre = (formData.get('nombre') as string).trim()
  const email = (formData.get('email') as string).trim()
  const telefono = (formData.get('telefono') as string).trim()
  const comision = parseFloat(formData.get('comision_porcentaje') as string) / 100
  const punto_reorden = parseInt(formData.get('punto_reorden') as string)

  // Crear usuario en Supabase Auth con contraseña temporal
  const adminClient = createAdminClient()
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: Math.random().toString(36).slice(-10),
    email_confirm: true,
    user_metadata: { rol: 'consignatario' },
  })
  if (authError || !authData.user) return

  const supabase = createClient()
  await supabase.from('consignatarios').insert({
    nombre,
    email,
    telefono: telefono || null,
    comision_porcentaje: comision,
    punto_reorden: isNaN(punto_reorden) ? 10 : punto_reorden,
    user_id: authData.user.id,
  })
  revalidatePath('/consignatarios')
}

export default async function ConsignatariosPage() {
  const supabase = createClient()
  const { data: consignatarios } = await supabase
    .from('consignatarios')
    .select('*')
    .order('nombre')
    .returns<Consignatario[]>()

  // Stock actual por consignatario
  const { data: stockPorConsignatario } = await supabase
    .from('dispositivos')
    .select('consignatario_id')
    .eq('estado', 'asignado')

  const stockMap = (stockPorConsignatario ?? []).reduce<Record<string, number>>((acc, d) => {
    if (d.consignatario_id) {
      acc[d.consignatario_id] = (acc[d.consignatario_id] ?? 0) + 1
    }
    return acc
  }, {})

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Consignatarios</h1>

      {/* Formulario nuevo consignatario */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
          Nuevo consignatario
        </h2>
        <form action={crearConsignatario} className="grid grid-cols-2 gap-3">
          <input name="nombre" placeholder="Nombre" required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <input name="email" type="email" placeholder="Email" required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <input name="telefono" placeholder="Teléfono (opcional)"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <input name="punto_reorden" type="number" min="0" placeholder="Punto de reorden (ej: 10)"
            defaultValue={10}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <div className="flex items-center gap-2">
            <input name="comision_porcentaje" type="number" step="0.1" min="0" max="100"
              placeholder="Comisión %" defaultValue={10}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <span className="text-sm text-gray-500">%</span>
          </div>
          <div className="flex justify-end">
            <button type="submit"
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              Crear
            </button>
          </div>
        </form>
      </div>

      {/* Lista */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Email</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Stock actual</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Comisión</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {consignatarios?.map((c) => {
              const stock = stockMap[c.id] ?? 0
              const alerta = stock <= c.punto_reorden
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.nombre}</td>
                  <td className="px-6 py-3 text-gray-600">{c.email}</td>
                  <td className="px-6 py-3 text-right">
                    <span className={alerta ? 'text-orange-600 font-semibold' : 'text-gray-900'}>
                      {stock} {alerta && '⚠'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700">
                    {(c.comision_porcentaje * 100).toFixed(1)}%
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link href={`/consignatarios/${c.id}`}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                      Ver detalle →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Crear `app/(admin)/consignatarios/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda } from '@/lib/utils'
import type { Consignatario, Asignacion, Diferencia, DispositivoConModelo } from '@/lib/types'

export default async function ConsignatarioDetallePage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: consignatario }, { data: dispositivos }, { data: asignaciones }, { data: diferencias }] =
    await Promise.all([
      supabase.from('consignatarios').select('*').eq('id', params.id).single<Consignatario>(),
      supabase.from('dispositivos').select('*, modelos(*)').eq('consignatario_id', params.id)
        .eq('estado', 'asignado').returns<DispositivoConModelo[]>(),
      supabase.from('asignaciones').select('*').eq('consignatario_id', params.id)
        .order('created_at', { ascending: false }).returns<Asignacion[]>(),
      supabase.from('diferencias').select('*').eq('estado', 'pendiente')
        .in('auditoria_id',
          (await supabase.from('auditorias').select('id').eq('consignatario_id', params.id)).data?.map(a => a.id) ?? []
        ).returns<Diferencia[]>(),
    ])

  if (!consignatario) notFound()

  const totalDeuda = (diferencias ?? []).reduce((sum, d) => sum + d.monto_deuda, 0)

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{consignatario.nombre}</h1>
          <p className="text-sm text-gray-500">{consignatario.email} · {consignatario.telefono}</p>
        </div>
        {totalDeuda > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-right">
            <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Deuda pendiente</p>
            <p className="text-xl font-bold text-red-700">{formatearMoneda(totalDeuda)}</p>
          </div>
        )}
      </div>

      {/* Stock asignado */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Stock asignado ({dispositivos?.length ?? 0} equipos)</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">IMEI</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dispositivos?.map((d) => (
              <tr key={d.id}>
                <td className="px-6 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                <td className="px-6 py-3 text-gray-900">{d.modelos.marca} {d.modelos.modelo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Historial de asignaciones */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Historial de asignaciones</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Unidades</th>
              <th className="text-right px-6 py-3 font-medium text-gray-600">Valor venta</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Firmado por</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {asignaciones?.map((a) => (
              <tr key={a.id}>
                <td className="px-6 py-3 text-gray-700">{new Date(a.fecha).toLocaleDateString('es-AR')}</td>
                <td className="px-6 py-3 text-right text-gray-900">{a.total_unidades}</td>
                <td className="px-6 py-3 text-right font-medium text-gray-900">{formatearMoneda(a.total_valor_venta)}</td>
                <td className="px-6 py-3 text-gray-700">{a.firmado_por}</td>
                <td className="px-6 py-3 text-right">
                  {a.documento_url && (
                    <a href={a.documento_url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 text-xs hover:underline">PDF</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/consignatarios/
git commit -m "feat: add consignatarios list and detail pages"
```

---

## Task 9: Inventario de dispositivos + carga CSV

**Files:**
- Create: `app/(admin)/inventario/page.tsx`
- Create: `app/(admin)/inventario/ImportarCSV.tsx`
- Create: `__tests__/csv-import.test.ts`

- [ ] **Step 1: Escribir tests del parser CSV**

Crear `__tests__/csv-import.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parsearCSVDispositivos, type FilaCSV, type ResultadoCSV } from '@/app/(admin)/inventario/ImportarCSV'

describe('parsearCSVDispositivos', () => {
  it('parsea filas válidas correctamente', () => {
    const csv = `imei,marca,modelo
123456789012345,Samsung,Galaxy A54
987654321098765,Motorola,G84`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(2)
    expect(result.errores).toHaveLength(0)
    expect(result.validas[0]).toEqual({ imei: '123456789012345', marca: 'Samsung', modelo: 'Galaxy A54' })
  })

  it('detecta IMEI con formato inválido', () => {
    const csv = `imei,marca,modelo
12345ABCDE12345,Samsung,A54`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(0)
    expect(result.errores[0]).toMatchObject({ linea: 2, error: expect.stringContaining('IMEI') })
  })

  it('detecta filas con columnas faltantes', () => {
    const csv = `imei,marca,modelo
123456789012345,Samsung`
    const result = parsearCSVDispositivos(csv)
    expect(result.errores[0].error).toMatch(/columnas/)
  })

  it('ignora filas vacías', () => {
    const csv = `imei,marca,modelo
123456789012345,Samsung,A54

987654321098765,Motorola,G84`
    const result = parsearCSVDispositivos(csv)
    expect(result.validas).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Correr tests — verificar que fallan**

```bash
npx vitest run __tests__/csv-import.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Crear `app/(admin)/inventario/ImportarCSV.tsx`**

```tsx
'use client'

import { useState, useRef } from 'react'
import Papa from 'papaparse'
import { validarIMEI } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

export interface FilaCSV {
  imei: string
  marca: string
  modelo: string
}

export interface ErrorCSV {
  linea: number
  error: string
}

export interface ResultadoCSV {
  validas: FilaCSV[]
  errores: ErrorCSV[]
}

export function parsearCSVDispositivos(csv: string): ResultadoCSV {
  const resultado = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: true })
  const filas = resultado.data

  if (filas.length <= 1) return { validas: [], errores: [] }

  // Saltar header
  const validas: FilaCSV[] = []
  const errores: ErrorCSV[] = []

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i]
    const linea = i + 1

    if (!fila || fila.length < 3 || fila.every(c => !c.trim())) continue

    if (fila.length < 3 || !fila[0] || !fila[1] || !fila[2]) {
      errores.push({ linea, error: 'Faltan columnas (se esperan: imei, marca, modelo)' })
      continue
    }

    const imei = fila[0].trim()
    const marca = fila[1].trim()
    const modelo = fila[2].trim()

    if (!validarIMEI(imei)) {
      errores.push({ linea, error: `IMEI inválido: "${imei}" (debe tener 15 dígitos numéricos)` })
      continue
    }

    validas.push({ imei, marca, modelo })
  }

  return { validas, errores }
}

export default function ImportarCSV({ onImportado }: { onImportado: () => void }) {
  const [resultado, setResultado] = useState<ResultadoCSV | null>(null)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState<{ ok: number; duplicados: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const csv = ev.target?.result as string
      setResultado(parsearCSVDispositivos(csv))
      setImportResult(null)
    }
    reader.readAsText(file)
  }

  async function handleImportar() {
    if (!resultado || resultado.validas.length === 0) return
    setImportando(true)

    const supabase = createClient()
    let ok = 0
    let duplicados = 0

    for (const fila of resultado.validas) {
      // Buscar o crear modelo
      let { data: modelo } = await supabase
        .from('modelos')
        .select('id')
        .eq('marca', fila.marca)
        .eq('modelo', fila.modelo)
        .single()

      if (!modelo) {
        const { data: nuevoModelo } = await supabase
          .from('modelos')
          .insert({ marca: fila.marca, modelo: fila.modelo, precio_costo: 0 })
          .select('id')
          .single()
        modelo = nuevoModelo
      }

      if (!modelo) continue

      const { error } = await supabase
        .from('dispositivos')
        .insert({ imei: fila.imei, modelo_id: modelo.id, estado: 'disponible' })

      if (error && error.code === '23505') duplicados++
      else if (!error) ok++
    }

    setImportResult({ ok, duplicados })
    setImportando(false)
    if (ok > 0) onImportado()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Carga masiva por CSV
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Formato: <code className="bg-gray-100 px-1 rounded">imei,marca,modelo</code> — una línea por equipo.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-gray-200"
      />

      {resultado && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-green-700">✓ {resultado.validas.length} filas válidas</span>
            {resultado.errores.length > 0 && (
              <span className="text-red-600">✗ {resultado.errores.length} errores</span>
            )}
          </div>

          {resultado.errores.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs space-y-1">
              {resultado.errores.map((e, i) => (
                <p key={i} className="text-red-700">Línea {e.linea}: {e.error}</p>
              ))}
            </div>
          )}

          {resultado.validas.length > 0 && (
            <button
              onClick={handleImportar}
              disabled={importando}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {importando ? 'Importando...' : `Importar ${resultado.validas.length} equipos`}
            </button>
          )}

          {importResult && (
            <p className="text-sm text-green-700">
              ✓ {importResult.ok} equipos importados
              {importResult.duplicados > 0 && ` · ${importResult.duplicados} duplicados ignorados`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr tests — verificar que pasan**

```bash
npx vitest run __tests__/csv-import.test.ts
```

Expected: PASS.

- [ ] **Step 5: Crear `app/(admin)/inventario/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import ImportarCSV from './ImportarCSV'
import { revalidatePath } from 'next/cache'
import type { DispositivoConModelo, Consignatario } from '@/lib/types'

const ESTADOS_LABELS: Record<string, string> = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  vendido: 'Vendido',
  devuelto: 'Devuelto',
}

const ESTADOS_COLORS: Record<string, string> = {
  disponible: 'bg-green-100 text-green-700',
  asignado: 'bg-blue-100 text-blue-700',
  vendido: 'bg-gray-100 text-gray-600',
  devuelto: 'bg-yellow-100 text-yellow-700',
}

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: { estado?: string; consignatario?: string }
}) {
  const supabase = createClient()

  let query = supabase
    .from('dispositivos')
    .select('*, modelos(*)')
    .order('created_at', { ascending: false })

  if (searchParams.estado) query = query.eq('estado', searchParams.estado)
  if (searchParams.consignatario) query = query.eq('consignatario_id', searchParams.consignatario)

  const [{ data: dispositivos }, { data: consignatarios }] = await Promise.all([
    query.returns<DispositivoConModelo[]>(),
    supabase.from('consignatarios').select('id, nombre').order('nombre').returns<Pick<Consignatario, 'id' | 'nombre'>[]>(),
  ])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Inventario de dispositivos</h1>

      <div className="mb-6">
        <ImportarCSV onImportado={async () => { 'use server'; revalidatePath('/inventario') }} />
      </div>

      {/* Filtros */}
      <form className="flex gap-3 mb-6 flex-wrap">
        <select name="estado" defaultValue={searchParams.estado ?? ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="consignatario" defaultValue={searchParams.consignatario ?? ''}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option value="">Todos los consignatarios</option>
          {consignatarios?.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <button type="submit"
          className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900">
          Filtrar
        </button>
      </form>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 text-sm text-gray-500">
          {dispositivos?.length ?? 0} dispositivos
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-600">IMEI</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Estado</th>
              <th className="text-left px-6 py-3 font-medium text-gray-600">Fecha ingreso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dispositivos?.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                <td className="px-6 py-3 text-gray-900">{d.modelos.marca} {d.modelos.modelo}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ESTADOS_COLORS[d.estado]}`}>
                    {ESTADOS_LABELS[d.estado]}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-500">
                  {new Date(d.created_at).toLocaleDateString('es-AR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/\(admin\)/inventario/ __tests__/csv-import.test.ts
git commit -m "feat: add inventory page with CSV bulk import"
```

---

## Task 10: Flujo de asignación con firma digital

**Files:**
- Create: `app/(admin)/asignar/page.tsx`
- Create: `app/(admin)/asignar/FirmaModal.tsx`
- Create: `lib/pdf/remito.tsx`
- Create: `__tests__/asignacion.test.ts`

- [ ] **Step 1: Escribir tests de lógica de asignación**

Crear `__tests__/asignacion.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { validarIMEIsParaAsignacion } from '@/app/(admin)/asignar/page'

describe('validarIMEIsParaAsignacion', () => {
  it('acepta lista de IMEIs válidos', () => {
    const result = validarIMEIsParaAsignacion('123456789012345\n987654321098765')
    expect(result.imeis).toHaveLength(2)
    expect(result.errores).toHaveLength(0)
  })

  it('rechaza IMEIs con formato inválido', () => {
    const result = validarIMEIsParaAsignacion('123456789012345\nABCDEFGHIJKLMNO')
    expect(result.errores).toHaveLength(1)
    expect(result.errores[0]).toMatch(/ABCDEFGHIJKLMNO/)
  })

  it('elimina duplicados', () => {
    const result = validarIMEIsParaAsignacion('123456789012345\n123456789012345')
    expect(result.imeis).toHaveLength(1)
  })

  it('ignora líneas vacías', () => {
    const result = validarIMEIsParaAsignacion('123456789012345\n\n987654321098765\n')
    expect(result.imeis).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Correr tests — verificar que fallan**

```bash
npx vitest run __tests__/asignacion.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Crear `app/(admin)/asignar/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validarIMEI, formatearMoneda, calcularPrecioVenta } from '@/lib/utils'
import FirmaModal from './FirmaModal'
import type { Consignatario, DispositivoConModelo, Config } from '@/lib/types'
import { useEffect } from 'react'

export function validarIMEIsParaAsignacion(texto: string): { imeis: string[]; errores: string[] } {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const imeis: string[] = []
  const errores: string[] = []
  const vistos = new Set<string>()

  for (const linea of lineas) {
    if (!validarIMEI(linea)) {
      errores.push(linea)
    } else if (!vistos.has(linea)) {
      imeis.push(linea)
      vistos.add(linea)
    }
  }

  return { imeis, errores }
}

export default function AsignarPage() {
  const [consignatarios, setConsignatarios] = useState<Consignatario[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [consignatarioId, setConsignatarioId] = useState('')
  const [textImeis, setTextImeis] = useState('')
  const [dispositivos, setDispositivos] = useState<DispositivoConModelo[]>([])
  const [erroresImei, setErroresImei] = useState<string[]>([])
  const [noEncontrados, setNoEncontrados] = useState<string[]>([])
  const [noDisponibles, setNoDisponibles] = useState<string[]>([])
  const [buscando, setBuscando] = useState(false)
  const [mostrarFirma, setMostrarFirma] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      supabase.from('consignatarios').select('*').order('nombre'),
      supabase.from('config').select('*').single(),
    ]).then(([{ data: c }, { data: conf }]) => {
      setConsignatarios(c ?? [])
      setConfig(conf)
    })
  }, [])

  async function buscarDispositivos() {
    const { imeis, errores } = validarIMEIsParaAsignacion(textImeis)
    setErroresImei(errores)
    if (imeis.length === 0) return

    setBuscando(true)
    const { data } = await supabase
      .from('dispositivos')
      .select('*, modelos(*)')
      .in('imei', imeis)
      .returns<DispositivoConModelo[]>()

    const encontrados = data ?? []
    const imeisEncontrados = new Set(encontrados.map(d => d.imei))
    const noEnc = imeis.filter(i => !imeisEncontrados.has(i))
    const noDisp = encontrados.filter(d => d.estado !== 'disponible').map(d => d.imei)
    const disponibles = encontrados.filter(d => d.estado === 'disponible')

    setNoEncontrados(noEnc)
    setNoDisponibles(noDisp)
    setDispositivos(disponibles)
    setBuscando(false)
  }

  const multiplicador = config?.multiplicador ?? 1.8
  const totalCosto = dispositivos.reduce((s, d) => s + d.modelos.precio_costo, 0)
  const totalVenta = calcularPrecioVenta(totalCosto, multiplicador)
  const consignatario = consignatarios.find(c => c.id === consignatarioId)

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Asignar stock</h1>

      <div className="space-y-6">
        {/* Paso 1: Consignatario */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            1. Seleccionar consignatario
          </label>
          <select
            value={consignatarioId}
            onChange={(e) => setConsignatarioId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">— Seleccionar —</option>
            {consignatarios.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        {/* Paso 2: IMEIs */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            2. Ingresar IMEIs (uno por línea)
          </label>
          <textarea
            value={textImeis}
            onChange={(e) => setTextImeis(e.target.value)}
            rows={6}
            placeholder="123456789012345&#10;987654321098765&#10;..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          />
          <button
            onClick={buscarDispositivos}
            disabled={!consignatarioId || !textImeis.trim() || buscando}
            className="mt-3 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 disabled:opacity-40"
          >
            {buscando ? 'Buscando...' : 'Verificar equipos'}
          </button>
        </div>

        {/* Errores de validación */}
        {(erroresImei.length > 0 || noEncontrados.length > 0 || noDisponibles.length > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm space-y-1">
            {erroresImei.map((i) => <p key={i} className="text-red-700">IMEI inválido: {i}</p>)}
            {noEncontrados.map((i) => <p key={i} className="text-red-700">No encontrado: {i}</p>)}
            {noDisponibles.map((i) => <p key={i} className="text-orange-700">No disponible: {i}</p>)}
          </div>
        )}

        {/* Preview */}
        {dispositivos.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-semibold text-gray-900">{dispositivos.length} equipos listos para asignar</h2>
              <div className="text-right text-sm">
                <p className="text-gray-500">Valor venta total</p>
                <p className="font-bold text-gray-900 text-lg">{formatearMoneda(totalVenta)}</p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">IMEI</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Modelo</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600">Precio venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dispositivos.map((d) => (
                  <tr key={d.id}>
                    <td className="px-6 py-3 font-mono text-xs text-gray-700">{d.imei}</td>
                    <td className="px-6 py-3 text-gray-900">{d.modelos.marca} {d.modelos.modelo}</td>
                    <td className="px-6 py-3 text-right text-gray-900">
                      {formatearMoneda(calcularPrecioVenta(d.modelos.precio_costo, multiplicador))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setMostrarFirma(true)}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700"
              >
                Continuar → Firma del consignatario
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de firma */}
      {mostrarFirma && consignatario && (
        <FirmaModal
          consignatario={consignatario}
          dispositivos={dispositivos}
          totalCosto={totalCosto}
          totalVenta={totalVenta}
          multiplicador={multiplicador}
          onCerrar={() => setMostrarFirma(false)}
          onConfirmado={() => {
            setMostrarFirma(false)
            setDispositivos([])
            setTextImeis('')
            setConsignatarioId('')
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr tests — verificar que pasan**

```bash
npx vitest run __tests__/asignacion.test.ts
```

Expected: PASS.

- [ ] **Step 5: Crear `app/(admin)/asignar/FirmaModal.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { createClient } from '@/lib/supabase/client'
import type { Consignatario, DispositivoConModelo } from '@/lib/types'

interface Props {
  consignatario: Consignatario
  dispositivos: DispositivoConModelo[]
  totalCosto: number
  totalVenta: number
  multiplicador: number
  onCerrar: () => void
  onConfirmado: () => void
}

export default function FirmaModal({
  consignatario, dispositivos, totalCosto, totalVenta, onCerrar, onConfirmado
}: Props) {
  const sigCanvasRef = useRef<SignatureCanvas>(null)
  const [firmadoPor, setFirmadoPor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function limpiarFirma() {
    sigCanvasRef.current?.clear()
  }

  async function confirmar() {
    if (!firmadoPor.trim()) {
      setError('Ingresá el nombre de quien firma')
      return
    }
    if (sigCanvasRef.current?.isEmpty()) {
      setError('La firma es obligatoria')
      return
    }

    setGuardando(true)
    setError(null)
    const supabase = createClient()

    // 1. Subir firma a Supabase Storage
    const firmaBase64 = sigCanvasRef.current!.toDataURL('image/png')
    const firmaBlob = await (await fetch(firmaBase64)).blob()
    const firmaPath = `firmas/${crypto.randomUUID()}.png`
    const { error: storageError } = await supabase.storage
      .from('documentos')
      .upload(firmaPath, firmaBlob, { contentType: 'image/png' })

    if (storageError) {
      setError('Error al guardar la firma')
      setGuardando(false)
      return
    }

    const { data: { publicUrl: firmaUrl } } = supabase.storage
      .from('documentos')
      .getPublicUrl(firmaPath)

    // 2. Crear asignación
    const { data: asignacion, error: asignError } = await supabase
      .from('asignaciones')
      .insert({
        consignatario_id: consignatario.id,
        fecha: new Date().toISOString().split('T')[0],
        total_unidades: dispositivos.length,
        total_valor_costo: totalCosto,
        total_valor_venta: totalVenta,
        firmado_por: firmadoPor.trim(),
        firma_url: firmaUrl,
      })
      .select('id')
      .single()

    if (asignError || !asignacion) {
      setError('Error al crear la asignación')
      setGuardando(false)
      return
    }

    // 3. Crear asignacion_items + actualizar dispositivos
    await supabase.from('asignacion_items').insert(
      dispositivos.map(d => ({ asignacion_id: asignacion.id, dispositivo_id: d.id }))
    )

    for (const d of dispositivos) {
      await supabase.from('dispositivos')
        .update({ estado: 'asignado', consignatario_id: consignatario.id })
        .eq('id', d.id)
    }

    // 4. Generar PDF (API route del Plan 2 — por ahora se omite documento_url)

    setGuardando(false)
    onConfirmado()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Firma del consignatario</h2>
        <p className="text-sm text-gray-500 mb-6">
          {consignatario.nombre} — {dispositivos.length} equipos
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre de quien recibe
          </label>
          <input
            type="text"
            value={firmadoPor}
            onChange={(e) => setFirmadoPor(e.target.value)}
            placeholder="Nombre y apellido"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Firma</label>
          <div className="border border-gray-300 rounded-xl overflow-hidden bg-gray-50">
            <SignatureCanvas
              ref={sigCanvasRef}
              penColor="black"
              canvasProps={{ width: 450, height: 180, className: 'w-full' }}
            />
          </div>
        </div>

        <button
          onClick={limpiarFirma}
          className="text-xs text-gray-400 hover:text-gray-600 mb-4"
        >
          Borrar firma
        </button>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onCerrar}
            className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={guardando}
            className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Confirmar asignación'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Crear bucket en Supabase Storage**

En el dashboard de Supabase → Storage → New bucket:
- Nombre: `documentos`
- Public: ✓ (para que los PDF/firmas sean accesibles por URL)

- [ ] **Step 7: Commit**

```bash
git add app/\(admin\)/asignar/ __tests__/asignacion.test.ts
git commit -m "feat: add stock assignment flow with digital signature"
```

---

## Task 11: Dashboard admin con KPIs

**Files:**
- Create: `app/(admin)/dashboard/page.tsx`

- [ ] **Step 1: Crear `app/(admin)/dashboard/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { formatearMoneda, calcularPrecioVenta } from '@/lib/utils'
import type { Config, Consignatario } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = createClient()

  const [
    { data: config },
    { count: totalDispositivos },
    { count: disponibles },
    { count: asignados },
    { count: vendidos },
    { data: consignatarios },
    { data: dispositivos },
  ] = await Promise.all([
    supabase.from('config').select('*').single<Config>(),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'disponible'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'asignado'),
    supabase.from('dispositivos').select('*', { count: 'exact', head: true }).eq('estado', 'vendido'),
    supabase.from('consignatarios').select('id, nombre, punto_reorden').returns<Pick<Consignatario, 'id' | 'nombre' | 'punto_reorden'>[]>(),
    supabase.from('dispositivos').select('consignatario_id, modelos(precio_costo)').eq('estado', 'asignado'),
  ])

  const multiplicador = config?.multiplicador ?? 1.8

  // Valor total del stock asignado (a precio de venta)
  const valorAsignado = (dispositivos ?? []).reduce((sum, d: any) => {
    return sum + calcularPrecioVenta(d.modelos?.precio_costo ?? 0, multiplicador)
  }, 0)

  // Alertas: consignatarios bajo su punto de reorden
  const stockPorConsignatario = (dispositivos ?? []).reduce<Record<string, number>>((acc, d: any) => {
    if (d.consignatario_id) acc[d.consignatario_id] = (acc[d.consignatario_id] ?? 0) + 1
    return acc
  }, {})

  const alertas = (consignatarios ?? []).filter(
    c => (stockPorConsignatario[c.id] ?? 0) <= c.punto_reorden
  )

  const kpis = [
    { label: 'Total dispositivos', value: totalDispositivos ?? 0, color: 'text-gray-900' },
    { label: 'Disponibles', value: disponibles ?? 0, color: 'text-green-700' },
    { label: 'Asignados', value: asignados ?? 0, color: 'text-blue-700' },
    { label: 'Vendidos', value: vendidos ?? 0, color: 'text-gray-500' },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{kpi.label}</p>
            <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Valor total asignado */}
      <div className="bg-blue-600 rounded-xl p-6 mb-8 text-white">
        <p className="text-sm font-medium opacity-80 mb-1">Valor total en consignación (precio venta)</p>
        <p className="text-4xl font-bold">{formatearMoneda(valorAsignado)}</p>
        <p className="text-sm opacity-70 mt-1">Multiplicador: ×{multiplicador}</p>
      </div>

      {/* Alertas de reorden */}
      {alertas.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-orange-800 uppercase tracking-wide mb-3">
            ⚠ Alertas de stock mínimo
          </h2>
          <ul className="space-y-1">
            {alertas.map((c) => (
              <li key={c.id} className="text-sm text-orange-700">
                {c.nombre} — {stockPorConsignatario[c.id] ?? 0} equipos
                (punto de reorden: {c.punto_reorden})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(admin\)/dashboard/
git commit -m "feat: add admin dashboard with KPIs and stock alerts"
```

---

## Task 12: Correr todos los tests + verificación final

- [ ] **Step 1: Correr suite completa de tests unitarios**

```bash
npx vitest run
```

Expected: todos los tests en verde (utils, csv-import, asignacion).

- [ ] **Step 2: Verificar build sin errores**

```bash
npm run build
```

Expected: compilación exitosa sin errores de TypeScript.

- [ ] **Step 3: Levantar dev server y verificar flujos manualmente**

```bash
npm run dev
```

Verificar en browser:
- `/login` → login con usuario admin creado en Supabase
- `/dashboard` → KPIs visibles
- `/modelos` → crear un modelo, cambiar multiplicador
- `/consignatarios` → crear un consignatario
- `/inventario` → importar CSV de prueba
- `/asignar` → seleccionar consignatario, verificar IMEIs, firmar

- [ ] **Step 4: Commit final del plan 1**

```bash
git add -A
git commit -m "feat: complete Plan 1 — foundation, auth, admin core (inventory, consignatarios, assignment)"
```

---

## Planes siguientes

- **Plan 2:** Sync de ventas (GOcelular DB) + Sistema de auditorías + PDFs de asignaciones y auditorías
- **Plan 3:** Panel consignatario completo + Reportes admin + PWA
