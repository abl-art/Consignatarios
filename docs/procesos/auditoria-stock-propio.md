# Auditoría de Stock Propio — Proceso de Control de Inventario

## ¿Para qué se hace?

La auditoría de stock propio tiene dos objetivos:

1. **Control de inventario**: verificar que la cantidad física de equipos en el depósito coincida con lo que dice el sistema. Detectar faltantes o sobrantes antes de que se conviertan en un problema.

2. **Existencia final del período**: obtener el valor del inventario al cierre de cada mes, dato necesario para calcular el **Costo de Mercadería Vendida (CMV)** en el estado de resultados:

```
CMV = Existencia Inicial + Compras del Período - Existencia Final
```

Sin la existencia final no podemos saber cuánto nos costó lo que vendimos.

---

## ¿Cuándo se hace?

- **Corte**: el sistema toma una foto del stock el **último día de cada mes**
- **Conteo físico**: se realiza el **primer día hábil del mes siguiente**
- **Frecuencia**: mensual, sin excepción

---

## ¿Quiénes participan?

| Rol | Responsabilidad |
|-----|----------------|
| **Responsable del depósito** | Realiza el conteo físico modelo por modelo. Firma el acta. |
| **Supervisor** | Verifica el proceso, revisa las diferencias y firma como aprobación. |

Ambas firmas son obligatorias para cerrar la auditoría.

---

## Paso a paso

### 1. Generar la planilla de conteo

**Cuándo:** último día del mes o primer día hábil del mes siguiente.
**Quién:** el administrador.
**Dónde:** Inventario → Auditoría Stock.

1. Seleccionar el mes de corte en el selector
2. Click en **"Generar planilla"**
3. El sistema genera automáticamente la lista de modelos con:
   - **Disponibles**: equipos con estado "available" en GOcelular
   - **Pendientes de asignar**: órdenes pagadas que todavía no tienen equipo vinculado
   - **Teórico**: disponibles - pendientes (lo que realmente debería estar en el depósito)
   - **Precio unitario**: el mejor precio de compra entre todos los proveedores
   - **Valor teórico**: teórico × precio unitario

La planilla queda en estado **"Pendiente"**.

### 2. Realizar el conteo físico

**Cuándo:** primer día hábil del mes siguiente.
**Quién:** el responsable del depósito.

1. En la auditoría pendiente, click en **"Iniciar conteo"**
2. Se expande la tabla con todos los modelos
3. El responsable cuenta físicamente los equipos de cada modelo en el depósito
4. Carga la cantidad real en la columna **"Real"** de cada modelo
5. El sistema calcula automáticamente:
   - **Diferencia** = Real - Teórico (negativo = faltante, positivo = sobrante)
   - **Valor real** = Real × precio unitario
   - **Valor diferencia** = Diferencia × precio unitario
6. Si hay observaciones (ej: "5 equipos en reparación", "se encontraron 2 equipos sin registrar"), anotarlas en el campo de observaciones
7. Click en **"Guardar conteo"**

La auditoría pasa a estado **"En conteo"**.

### 3. Revisar y firmar

**Quién:** responsable + supervisor.

1. El supervisor revisa las diferencias
2. Si todo está correcto, click en **"Firmar"**
3. Paso 1: el responsable ingresa su nombre y firma digitalmente
4. Paso 2: el supervisor ingresa su nombre y firma digitalmente
5. La auditoría queda en estado **"Firmada"**

### 4. Descargar el acta

1. En el header de cada auditoría, click en **"Descargar PDF"**
2. El PDF incluye:
   - Fecha de corte y fecha de conteo
   - Tabla completa con todos los modelos (teórico, real, diferencia, valores)
   - **Existencia Final del Período** destacada (el valor total real contado)
   - Observaciones
   - Firmas del responsable y del supervisor
   - Pie de página: "Generado por GOcelular360"

---

## ¿Qué hacer con las diferencias?

| Situación | Acción |
|-----------|--------|
| **Faltante** (Real < Teórico) | Investigar: ¿se asignó sin registrar? ¿se perdió? ¿está en reparación? Documentar en observaciones. |
| **Sobrante** (Real > Teórico) | Investigar: ¿se devolvió sin registrar? ¿se recibió mercadería sin ingresar al sistema? |
| **Sin diferencia** | OK, el inventario cuadra. |

Si las diferencias se repiten mes a mes, hay un problema de proceso que debe corregirse (ej: la gente no registra las devoluciones, o se asignan equipos sin pasar por el sistema).

---

## Datos que genera para el P&L

La auditoría firmada provee:

| Dato | Uso |
|------|-----|
| **Existencia Final** | Se usa como "Existencia Inicial" del mes siguiente |
| **Valor del inventario** | Valorizado al mejor precio de compra |
| **Diferencias** | Pueden registrarse como pérdida/ganancia de inventario |

### Ejemplo de cálculo de CMV:

```
Existencia Inicial (auditoría mes anterior):    $150.000.000
+ Compras del mes:                              $ 80.000.000
- Existencia Final (auditoría este mes):        $120.000.000
= Costo de Mercadería Vendida:                  $110.000.000
```

---

## Buenas prácticas

1. **No postergar el conteo**: hacerlo siempre el primer día hábil. Si se demora, las diferencias se vuelven más difíciles de explicar porque el stock sigue moviéndose.

2. **Contar sin mirar el teórico**: idealmente el responsable cuenta sin ver la columna "Teórico" para evitar sesgo. Después se compara.

3. **Documentar todo**: si hay equipos en reparación, en tránsito, o prestados, anotarlo en observaciones para que la diferencia tenga explicación.

4. **Revisar antes de firmar**: el supervisor debe verificar que las diferencias tengan sentido. Una diferencia grande sin explicación requiere investigación antes de firmar.

5. **Guardar los PDFs**: descargar y archivar cada acta firmada como respaldo fuera del sistema.

---

## Resumen del flujo

```
Último día del mes: Generar planilla (automático desde GOcelular)
    ↓
Primer día hábil: Responsable cuenta físicamente → carga cantidades reales
    ↓
Supervisor revisa diferencias
    ↓
Ambos firman digitalmente
    ↓
Descargar PDF del acta
    ↓
El "Valor real" queda como Existencia Final del mes → input para el P&L
```
