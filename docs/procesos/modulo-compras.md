# Módulo de Compras — Guía de uso

## Resumen

El módulo de Compras gestiona el ciclo completo de compra: desde la carga de proveedores y precios hasta la recepción de mercadería y control de IMEI. Se accede desde el sidebar → **Compras**.

---

## 1. Proveedores

**Ruta:** Compras → Proveedores

Acá se cargan y mantienen los datos de cada proveedor.

### Cargar un proveedor nuevo
1. Click en **"Nuevo Proveedor"**
2. Completar:
   - Nombre (obligatorio)
   - Contacto, CUIT, WhatsApp, Email
   - Tipo de producto que vende (Celulares, Smartwatches, Parlantes, Auriculares, Kits de Seguridad)
   - Marcas que maneja (para celulares: Motorola, Samsung, Nubia, Xiaomi, Honor)
   - Plazos de pago (30, 60, 90 días o combinaciones)
   - Observaciones
3. Click en **Guardar**

Desde la lista se puede editar o eliminar cualquier proveedor.

---

## 2. Modelos y Precios

**Ruta:** Compras → Modelos y Precios

Acá se mantiene el catálogo de productos y se cargan los precios de cada proveedor.

### Cargar un producto nuevo
1. Click en **"Nuevo Modelo"**
2. Completar: Código, Nombre, Categoría
3. Guardar

### Cargar precios
1. En la tabla de productos, cada columna es un proveedor
2. Click en la celda de precio (o en **"+ precio"**) para abrir el formulario
3. Cargar el precio y el plazo de pago (Contado, 24hs, 48hs, etc.)
4. Guardar

El mejor precio de cada producto se marca con una estrella.

**Filtros disponibles:** por categoría y por marca (para celulares).

---

## 3. Gestor de Pedidos

**Ruta:** Compras → Gestor de Pedidos

Tiene 4 pestañas que representan las etapas del pedido:

### 3.1 Catálogo (armar el pedido)

1. Filtrar por categoría y marca
2. Para cada producto, ver los precios de cada proveedor
3. Cargar la cantidad que se quiere pedir en la columna de cada proveedor
4. Si hay forecast de demanda disponible, aparece como referencia debajo del nombre del producto
5. Click en **"Agregar"** para sumar al pedido
6. Los productos ya agregados quedan marcados en verde

### 3.2 Mi Pedido (revisar antes de generar)

1. Se ven todos los items del pedido con proveedor, cantidad, precio y plazo
2. Se pueden editar cantidades o eliminar items
3. Abajo se ve el resumen:
   - Subtotal neto
   - IVA 21%
   - Total general
   - Cantidad de unidades
   - Desglose por plazo de pago
4. Click en **"Generar Notas de Pedido"** → crea automáticamente una nota por proveedor

### 3.3 Notas de Pedido (confirmar y enviar)

Cada nota de pedido pasa por estos estados:

**Borrador →** se pueden editar cantidades y eliminar items
- Click en **"Confirmar"** para pasar al siguiente estado

**Confirmado →** cantidades bloqueadas
- Click en **"Enviar"** para elegir canal de envío

**Opciones de envío:**
- **WhatsApp:** abre WhatsApp con el mensaje formateado con todos los items, subtotales e IVA
- **Email:** abre el cliente de mail con el pedido formateado
- **Ver PDF / Descargar PDF:** genera un documento profesional con el detalle del pedido

### 3.4 Enviados (seguimiento de entregas)

Una vez enviado, el pedido aparece acá para hacer seguimiento:

| Dato | Descripción |
|------|-------------|
| Proveedor | Nombre del proveedor |
| Fecha pedido | Cuándo se generó |
| Items | Cantidad de unidades |
| Total c/IVA | Monto total con impuestos |
| Estado | "En tránsito" (azul) o "Recibido" (verde) |
| IMEI | Descargar o subir archivo Excel con los IMEI de los equipos |
| Entrega | Fecha de recepción o botón "Marcar recibido" |
| Demora | Días desde envío hasta recepción |
| Ingreso stock | Checkbox para confirmar que se ingresó al inventario |

**Para marcar un pedido como recibido:**
1. Click en **"Marcar recibido"** → registra la fecha y calcula la demora

**Para cargar los IMEI:**
1. Expandir el pedido haciendo click en la fila
2. En la sección IMEI, click en **"Cargar Excel"**
3. Seleccionar el archivo .xlsx con los IMEI
4. Una vez cargado, se puede descargar en cualquier momento

---

## 4. Análisis de compras

Debajo de las tarjetas principales en la página de Compras hay dos secciones analíticas:

### Plazo promedio de entrega
- Muestra el promedio general y por categoría de producto
- Click en una categoría para ver el gráfico de barras por proveedor
- Se calcula desde la confirmación del pedido hasta la recepción

### Análisis de compras
- Gráfico de barras con filtros:
  - **Período:** Últimos 7 días, Esta semana, Este mes, Fechas personalizadas, Todo
  - **Vista:** Por proveedor o Por producto
  - **Métrica:** Unidades o Pesos
  - **Filtro proveedor:** para ver solo un proveedor
  - **Filtro producto:** para ver solo un producto
- Tabla con el detalle: unidades, inversión y porcentaje del total
- Útil para entender el poder de negociación frente a cada proveedor

---

## Flujo completo resumido

```
Cargar proveedores → Cargar productos → Cargar precios
    ↓
Armar pedido en Catálogo → Revisar en Mi Pedido
    ↓
Generar Notas de Pedido (una por proveedor)
    ↓
Confirmar → Enviar por WhatsApp / Email / PDF
    ↓
Seguimiento en Enviados → Marcar recibido → Cargar IMEI → Ingreso stock
    ↓
Análisis: plazos de entrega + volumen por proveedor/producto
```
