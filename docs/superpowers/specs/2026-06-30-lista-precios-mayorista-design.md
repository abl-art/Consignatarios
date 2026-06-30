# Lista de Precios Mayorista

## Objetivo

Generar una lista de precios descargable en PDF para la venta mayorista de celulares. La tabla permite al admin configurar un margen (MUP%), ocultar modelos que no quiere mostrar, y descargar un PDF limpio con solo los precios de venta.

## Ubicación

Nueva sub-página en la sección Consignatarios: `/consignatarios/lista-precios`.
Se agrega como ítem en el sidebar debajo de "Dashboard".

## Fuente de datos

- Productos de `compras_productos` filtrados por `categoria = 'Celulares'`
- Precios de `compras_precios`: se toma el **mejor precio** (mínimo) por producto entre todos los proveedores
- Productos sin precio de ningún proveedor no se muestran

## Tabla interactiva (vista admin)

| Columna | Descripción |
|---------|-------------|
| Modelo | Nombre del producto |
| Precio Costo (Neto) | Mejor precio entre proveedores |
| MUP % | Valor global (mostrado como referencia) |
| Precio Venta (Neto) | `precio_costo * (1 + MUP/100)` |
| IVA (21%) | `precio_venta_neto * 0.21` |
| Precio con IVA | `precio_venta_neto + iva` |
| Visibilidad | Toggle ojito: visible/oculto |

- Los modelos ocultos se muestran con opacidad reducida y texto tachado
- Input de MUP arriba de la tabla, valor global para todos los productos

## Cálculos

```
precio_venta_neto = precio_costo * (1 + MUP / 100)
iva = precio_venta_neto * 0.21
precio_con_iva = precio_venta_neto + iva
```

## Persistencia

### Nueva tabla: `lista_precios_config`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | serial PK | - |
| mup_porcentaje | numeric | Porcentaje de MUP (ej: 30) |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

Solo una fila en esta tabla (configuración singleton).

### Campo nuevo en `compras_productos`

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| oculto_lista_precios | boolean | false | Si está oculto en la lista de precios |

## PDF

- Botón "Descargar PDF" arriba de la tabla
- Solo incluye modelos **visibles** (oculto_lista_precios = false)
- Columnas del PDF: **Modelo**, **Precio Venta (Neto)**, **IVA (21%)**, **Precio con IVA**
- No incluye precio de costo (información interna)
- Se genera via API route `/api/pdf/lista-precios/route.tsx`
- Usa `@react-pdf/renderer` (patrón existente en el proyecto)

## Arquitectura

### Archivos nuevos

| Archivo | Tipo | Propósito |
|---------|------|-----------|
| `/app/(admin)/consignatarios/lista-precios/page.tsx` | Server Component | Carga datos de productos, precios y config MUP |
| `/app/(admin)/consignatarios/lista-precios/ListaPreciosClient.tsx` | Client Component | Tabla interactiva, toggle ojito, input MUP |
| `/lib/actions/lista-precios.ts` | Server Actions | Persistir MUP, toggle visibilidad |
| `/lib/pdf/lista-precios.tsx` | PDF Component | Template del PDF con React PDF |
| `/app/api/pdf/lista-precios/route.tsx` | API Route | Genera y sirve el PDF |

### Server Actions

- `actualizarMup(porcentaje: number)` - Upsert en `lista_precios_config`
- `toggleVisibilidadProducto(productoId: number)` - Toggle `oculto_lista_precios` en `compras_productos`

### Sidebar

Agregar ítem "Lista de Precios" en el grupo Consignatarios del layout admin, debajo de Dashboard.
