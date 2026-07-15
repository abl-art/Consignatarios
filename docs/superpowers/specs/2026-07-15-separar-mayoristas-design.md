# Separar Mayoristas de Consignatarios — Spec

## Resumen

Crear una sección "Mayoristas" independiente dentro de "Canales de Comercialización", moviendo Lista de Precios, Proformas y Asignaciones mayoristas fuera de Consignatarios. Agregar gestión de clientes mayoristas con datos fiscales y de contacto.

## Navegación

```
Canales de Comercialización
  Consignatarios
    ├── Dashboard
    ├── Asignaciones (solo consignatarios)
    ├── Devoluciones
    └── Credenciales
  Mayoristas
    ├── Clientes (3 tarjetas: Listado, Cuenta Corriente, Pagos)
    ├── Lista de Precios
    ├── Proformas (sin store_id, sin nombre; con selector de cliente)
    └── Asignaciones (solo mayoristas)
```

## Clientes Mayoristas

### Página principal: `/mayoristas/clientes`
3 tarjetas de navegación:
- **Listado de Clientes** → `/mayoristas/clientes/listado`
- **Cuenta Corriente** → placeholder "Próximamente"
- **Pagos** → placeholder "Próximamente"

### Listado: `/mayoristas/clientes/listado`
Tabla de clientes + formulario de creación con campos:
- Nombre comercial (required)
- Razón social
- Condición IVA: Monotributo | Inscripto (selector)
- CUIT
- Teléfono
- Email
- Dirección de entrega
- Transporte

### Tabla SQL: `clientes_mayoristas`
```sql
id uuid PK default gen_random_uuid()
nombre_comercial text NOT NULL
razon_social text
condicion_iva text NOT NULL DEFAULT 'monotributo'
cuit text
telefono text
email text
direccion_entrega text
transporte text
created_at timestamptz DEFAULT now()
```

## Proformas (cambios)

- Ruta: `/mayoristas/proformas`
- Eliminar campo "Store ID" del formulario
- Eliminar campo "Nombre" de la proforma
- Reemplazar input texto "cliente_nombre" por dropdown de `clientes_mayoristas`
- Dropdown incluye opción "+ Nuevo cliente" que abre formulario inline
- Guardar `cliente_mayorista_id` (FK) en vez de texto libre

### Migración proformas
```sql
ALTER TABLE proformas ADD COLUMN cliente_mayorista_id uuid REFERENCES clientes_mayoristas(id);
```
Columnas `cliente_nombre` y `store_id` se mantienen por datos históricos.

## Lista de Precios
- Mover de `/consignatarios/lista-precios` a `/mayoristas/lista-precios`
- Sin cambios funcionales

## Asignaciones
- `/mayoristas/asignaciones` — solo flujo mayorista (proformas → IMEIs)
- `/consignatarios/asignaciones` — solo flujo consignatarios (sin tab mayorista)

## Archivos a crear/modificar

### Crear
- `app/(admin)/mayoristas/clientes/page.tsx` — 3 tarjetas
- `app/(admin)/mayoristas/clientes/listado/page.tsx` — tabla + form
- `app/(admin)/mayoristas/lista-precios/page.tsx` — wrapper (mover de consignatarios)
- `app/(admin)/mayoristas/lista-precios/ListaPreciosClient.tsx` — mover
- `app/(admin)/mayoristas/proformas/page.tsx` — wrapper (mover)
- `app/(admin)/mayoristas/proformas/ProformasClient.tsx` — mover + modificar
- `app/(admin)/mayoristas/asignaciones/page.tsx` — data fetch mayorista
- `app/(admin)/mayoristas/asignaciones/AsignacionesMayorista.tsx` — extraer de AsignacionesTabs
- `lib/actions/clientes-mayoristas.ts` — CRUD clientes
- `supabase/migrations/20260715_clientes_mayoristas.sql`

### Modificar
- `app/(admin)/layout.tsx` — agregar sección Mayoristas, quitar sublinks de consignatarios
- `app/(admin)/consignatarios/asignaciones/page.tsx` — solo pasar datos consignatarios
- `app/(admin)/consignatarios/asignaciones/AsignacionesTabs.tsx` — eliminar tab mayorista
- `lib/actions/proformas.ts` — agregar cliente_mayorista_id, quitar store_id/nombre
- `lib/types.ts` — agregar tipo ClienteMayorista

### Eliminar (rutas, no archivos — los archivos se mueven)
- `app/(admin)/consignatarios/lista-precios/` → movido a mayoristas
- `app/(admin)/consignatarios/proformas/` → movido a mayoristas
