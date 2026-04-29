# Gestión de TACs — Spec

## Contexto

Para bloquear teléfonos con Trustonic, los TACs (primeros 8 dígitos del IMEI) deben estar precargados en la plataforma. Cada vez que ingresa stock nuevo (propio o de terceros) pueden aparecer TACs que Trustonic no tiene. Se necesita una herramienta que detecte automáticamente los TACs faltantes y genere la lista para pedir su carga.

## Modelo de datos

### Tabla `tacs_cargados`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| tac | text PK | Primeros 8 dígitos del IMEI |
| marca | text | Marca del equipo |
| modelo | text | Nombre del modelo |
| origen | text | 'inventario' o 'terceros' |
| created_at | timestamptz DEFAULT now() | Cuándo se registró |

RLS: admin_all policy.

### Relaciones
- Una marca tiene muchos modelos
- Un modelo puede tener múltiples TACs (variantes de storage, región, etc.)

## Carga inicial

1. **Inventario propio**: el sistema extrae automáticamente todos los TACs únicos de `inventory_items` de GOcelular, con marca y modelo de `device_models`
2. **Terceros**: el usuario sube el archivo de TACs ya cargados que tiene

Ambos se insertan en `tacs_cargados`.

## Detección automática de TACs nuevos

Al cargar la página "Gestión TACs":
1. Query a GOcelular: todos los TACs únicos de `inventory_items` + `device_models` (marca, modelo)
2. Query a `tacs_cargados`: todos los TACs registrados
3. Diferencia = TACs en inventario que no están en `tacs_cargados`
4. Estos son los "TACs pendientes de cargar en Trustonic"

No requiere acción manual del usuario para detectar TACs nuevos del inventario propio.

## Archivo de terceros

### Template
3 columnas: **IMEI**, **Modelo**, **Marca**

Botón "Descargar template" genera un Excel vacío con esas 3 columnas.

### Upload
1. Usuario sube Excel con el template completado
2. Sistema extrae TAC (primeros 8 dígitos de cada IMEI), modelo y marca
3. Cruza contra `tacs_cargados`
4. Muestra preview: TACs nuevos vs ya cargados
5. Los nuevos se agregan como pendientes

## UI — Página "Gestión TACs"

### Ubicación
Sidebar debajo de Inventario. Con badge de notificación (número rojo) cuando hay TACs pendientes.

### Cards resumen (arriba)
- TACs cargados (total)
- TACs nuevos pendientes (alerta si > 0)

### TACs pendientes de cargar (medio)
Tabla con: TAC, Marca, Modelo, Origen
- Botón "Descargar lista para Trustonic" → Excel con TACs nuevos
- Botón "Marcar todos como cargados" → los inserta en `tacs_cargados` y limpia la lista

### Subir archivo de terceros
- Botón "Descargar template"
- Upload de Excel
- Preview de TACs detectados

### TACs cargados por marca (abajo)
Tabla agrupada por marca → modelos → TACs de cada modelo
- Filtro por marca
- Colapsable

### Sidebar badge
Número rojo con cantidad de TACs pendientes. Se calcula al cargar la página.

## Archivos a crear/modificar

### Nuevos
- `supabase/migrations/20260429_create_tacs_cargados.sql`
- `lib/actions/tacs.ts` — fetch TACs inventario, CRUD tacs_cargados, detección
- `app/(admin)/gestion-tacs/page.tsx`
- `app/(admin)/gestion-tacs/GestionTacsClient.tsx`

### Modificar
- `supabase/schema.sql` — agregar tabla
- `app/(admin)/layout.tsx` — agregar al sidebar con badge
- `components/NavIcon.tsx` — agregar icono si necesario
