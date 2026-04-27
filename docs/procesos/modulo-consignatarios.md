# Módulo de Consignatarios — Guía de uso

## ¿Qué es un consignatario?

GOcelular comercializa celulares a través de distintos canales de venta. Uno de esos canales son los **consignatarios**: personas o comercios que reciben equipos en consignación para venderlos en sus propios puntos de venta.

El consignatario **no compra** los equipos. GOcelular le entrega stock, el consignatario los vende a través de la plataforma GOcuotas, y al final del mes cobra una **comisión** por cada venta realizada. Si un equipo no se vende, se devuelve.

Para controlar esta operación, GOcelular establece una **garantía** por consignatario: un monto máximo de stock que se le puede asignar. Esto limita el riesgo en caso de faltantes o incumplimientos.

### Canales de venta de GOcelular
| Canal | Descripción |
|-------|-------------|
| **Ecommerce** | Tienda online propia (GOcelular) |
| **Consignatarios** | Stock en consignación en puntos de venta de terceros |
| **Terceros (Merchants)** | Comercios que venden con financiación GOcuotas pero manejan su propio stock |

---

## Panel del Administrador

### 1. Crear un consignatario

**Ruta:** Consignatarios → lista principal

1. Click en **"Nuevo Consignatario"**
2. Completar:
   - **Nombre** del consignatario o comercio
   - **Email** (será su usuario para ingresar al portal)
   - **Contraseña** (mínimo 6 caracteres)
   - **Teléfono**
   - **Comisión %** — porcentaje que cobra por cada venta (sobre el precio neto)
   - **Punto de reorden** — cantidad mínima de stock (genera alerta cuando baja de ese nivel)
   - **Garantía** — monto máximo en pesos de stock que se le puede asignar
   - **Store prefix** — prefijo que identifica sus tiendas en GOcuotas (para matchear ventas automáticamente)
3. Guardar

El sistema crea automáticamente un usuario con rol "consignatario" que puede ingresar al portal de autogestión.

### 2. Asignar stock

**Ruta:** Asignar Stock (sidebar o tab bar mobile)

Esta es la operación central: entregar equipos a un consignatario.

1. **Seleccionar el consignatario** del dropdown
2. **Escanear los IMEI** de los equipos a entregar:
   - Escribir/pegar el IMEI y presionar Enter
   - O usar el **escáner de cámara** (botón "Escanear") para leer el código de barras de la caja
   - La cámara queda abierta para escaneo continuo
   - Cada IMEI escaneado se agrega automáticamente a la lista
3. **Revisar la selección**: se muestra agrupada por modelo con cantidades
4. **Control de garantía**: el sistema verifica que el valor del stock no supere la garantía disponible:
   - Garantía total
   - Ya comprometido (stock actual + deudas pendientes)
   - Esta asignación
   - Disponible restante
   - **Si se excede, no permite asignar**
5. **Crear asignación** → queda en estado "borrador" hasta que el consignatario firme
6. **Firma del consignatario** al momento de la entrega física
7. Se genera un **PDF de remito** descargable como comprobante

### 3. Devoluciones

**Ruta:** Consignatarios → Devoluciones

Cuando un consignatario devuelve equipos no vendidos:

1. Escanear o ingresar el IMEI del equipo devuelto
2. El sistema lo marca como "devuelto"
3. Se libera la garantía comprometida por ese equipo
4. El equipo vuelve al stock disponible

### 4. Auditorías

**Ruta:** Consignatarios → Auditorías

Las auditorías verifican que el consignatario tenga físicamente los equipos que el sistema dice que tiene.

**Tipos:**
- **Auditoría física**: el admin va al punto de venta y escanea los equipos presentes
- **Auto-auditoría**: el consignatario escanea sus equipos desde su portal (obligatoria mensualmente)

**Proceso:**
1. Se escanean todos los equipos presentes
2. El sistema compara contra lo que debería tener
3. Si hay diferencias:
   - **Faltante**: equipo que debería estar pero no está → se genera una deuda
   - **Sobrante**: equipo que está pero no debería → se registra
4. Se genera un acta de auditoría en PDF

### 5. Diferencias

**Ruta:** Consignatarios → Diferencias

Registra los faltantes y sobrantes detectados en auditorías.

| Estado | Significado |
|--------|-------------|
| Pendiente | Deuda sin cobrar |
| Cobrado | Se descontó de la liquidación mensual |
| Resuelto | Se resolvió (equipo apareció, se anuló, etc.) |

Las deudas pendientes se descuentan automáticamente de la liquidación del consignatario.

### 6. Ventas

**Ruta:** Consignatarios → Ventas

Muestra todas las ventas realizadas por los consignatarios. Los datos vienen de la **sincronización con GOcuotas** (no se cargan manualmente).

Se puede filtrar por mes y por consignatario. Cada venta muestra:
- Fecha, IMEI, modelo, tienda
- Precio de venta
- Comisión generada

### 7. Liquidaciones

**Ruta:** Consignatarios → Liquidaciones

Las liquidaciones son el **resumen mensual de comisiones** de cada consignatario.

**Cómo funciona:**
1. Click en **"Generar liquidaciones"** (una vez al mes)
2. El sistema calcula para cada consignatario:
   - Total de comisiones (suma de ventas del mes)
   - Diferencias descontadas (faltantes de auditorías)
   - **Neto a pagar** = comisiones - diferencias

**Estados de la liquidación:**
| Estado | Significado |
|--------|-------------|
| Borrador | Recién generada |
| Retenida | El consignatario no completó la auto-auditoría del mes |
| Pendiente | Lista para pagar |
| Bloqueada | El admin la bloqueó por algún motivo |
| Pagada | Se abonó al consignatario |

**Importante:** la liquidación queda **retenida** hasta que el consignatario complete su auto-auditoría mensual. Esto incentiva que audite su stock.

Se puede descargar un **PDF** de cada liquidación como comprobante.

### 8. Garantías

**Ruta:** Consignatarios → Garantías

Vista consolidada del uso de garantía de todos los consignatarios:
- Garantía total asignada
- Stock comprometido (a precio de costo)
- Deuda pendiente (de auditorías)
- Disponible
- Barra visual de uso (verde/amarillo/rojo)
- Alerta si está excedido

### 9. Dashboard de Consignatarios

**Ruta:** Consignatarios → Dashboard

Vista ejecutiva con:
- Total de equipos en el sistema (disponibles, asignados, vendidos)
- Resumen de garantías (total, comprometido, disponible)
- Ventas y comisiones del mes actual
- Ranking de consignatarios por comisiones
- Diferencias pendientes por cobrar
- Estado de liquidaciones (pendientes, retenidas, bloqueadas)
- Gráfico de permanencia de stock (días promedio que un equipo está antes de venderse)

### 10. Credenciales

**Ruta:** Consignatarios → Credenciales

Tabla con email y contraseña de cada consignatario para gestión rápida de accesos.

---

## Portal del Consignatario

Cuando un consignatario ingresa con su email y contraseña, accede a su propio portal con estas secciones:

### Mi Dashboard
- Garantía: total, comprometido, disponible
- Comisiones del mes
- Deuda pendiente por diferencias
- Gráfico de ventas de los últimos 12 meses
- **Alerta** si tiene una liquidación retenida por falta de auto-auditoría

### Mi Stock
- Lista de todos los equipos que tiene asignados
- Agrupados por marca y modelo
- Antigüedad promedio (verde < 30 días, amarillo 30-60, rojo > 60)

### Mis Ventas
- Historial de ventas con filtro por mes
- Detalle: fecha, tienda, IMEI, modelo, precio, comisión

### Auto-Auditoría
- **Obligatoria mensualmente** para liberar el pago de comisiones
- El consignatario escanea todos los equipos que tiene
- El sistema detecta faltantes o sobrantes
- Al completar, se genera un acta en PDF
- La liquidación retenida pasa a "pendiente" (lista para pago)

### Mis Liquidaciones
- Estado de cada liquidación mensual
- Si está retenida: link directo a la auto-auditoría
- Descarga de PDF por cada liquidación

---

## Flujo completo resumido

```
Admin crea consignatario (nombre, email, garantía, comisión)
    ↓
Admin asigna stock (escanear IMEI → firma → remito PDF)
    ↓
Consignatario vende (venta registrada automáticamente via GOcuotas)
    ↓
Sync: ventas se importan al sistema con precio y comisión
    ↓
Fin de mes: admin genera liquidaciones
    ↓
Consignatario completa auto-auditoría → libera el pago
    ↓
Admin marca liquidación como pagada
    ↓
Si hay faltantes en auditoría → se descuentan de la próxima liquidación
    ↓
Devoluciones: equipos no vendidos vuelven al stock → se libera garantía
```

---

## Glosario

| Término | Definición |
|---------|------------|
| **Consignatario** | Comercio o persona que recibe stock en consignación para vender |
| **Garantía** | Monto máximo de stock (a costo) que se le puede asignar |
| **Comisión** | Porcentaje que cobra el consignatario por cada venta |
| **Liquidación** | Resumen mensual de comisiones menos descuentos |
| **Auto-auditoría** | Verificación mensual que hace el consignatario de su stock |
| **Diferencia** | Faltante o sobrante detectado en una auditoría |
| **Remito** | Documento que certifica la entrega de stock (con firma) |
| **Store prefix** | Prefijo que identifica las tiendas del consignatario en GOcuotas |
| **IMEI** | Código único de 15 dígitos que identifica cada equipo celular |
