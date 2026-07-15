# IVA en Flujo de Fondos + Tarjeta Finanzas

**Fecha:** 2026-06-02
**Estado:** Aprobado

## Objetivo

Integrar el impacto del IVA (credito y debito fiscal) en el flujo de fondos existente como una columna diferenciada, y mostrar una tarjeta resumen en el panel de Finanzas. Esto permite visualizar el beneficio de financiamiento gratuito que genera el desfase temporal entre tomar el credito fiscal al comprar y generar el debito fiscal cuota a cuota.

## Calculo del saldo IVA mensual

Para cada mes calendario:

**Credito fiscal:**
- Suma de (precio_unitario * cantidad * 0.21) de todos los pedidos con `entregadoAt` dentro del mes
- Precio unitario: se usa `getMejorPrecio()` (mejor precio de reposicion por producto)
- Fuente: pedidos en `flujo_config` (keys `pedido_*`)

**Debito fiscal:**
- Suma de (installment_amount - installment_amount / 1.21) de todas las cuotas con `installment_due_at` dentro del mes
- Solo ordenes no descartadas (`order_discarded_at IS NULL`)
- Fuente: `gocuotas_installments` JOIN `gocuotas_orders` en la base GOcelular

**Saldo del mes:** Credito - Debito
- Positivo = a favor (no sale plata del flujo)
- Negativo = a pagar (egreso conceptual)

**No se acumula en la columna IVA.** El arrastre lo hace el propio flujo a traves del `cash_balance` acumulado.

## Columna IVA en el flujo de fondos

- Nueva columna `iva` en la estructura `FlujoDiario`
- Color diferenciado (violeta) para distinguir que es conceptual, no un movimiento real de caja
- Valor $0 todos los dias excepto el dia 20 del mes siguiente (o habil siguiente), que es cuando vence la DDJJ
- Ese dia: el saldo del mes anterior (credito - debito del mes que se declara)
- Se suma o resta al calculo de `net_flow` y por ende al `cash_balance`

**Ejemplo:**
- IVA de mayo se muestra el 20 de junio (o habil siguiente)
- IVA de junio se muestra el 21 de julio (o habil siguiente)

**Dia habil siguiente:** Si el 20 cae sabado, se mueve al lunes 22. Si cae domingo, al lunes 21. Reutilizar logica de dias habiles ya existente en el proyecto.

## Tarjeta en panel de Finanzas (Opcion B)

Una card que muestra:

1. **Numero principal:** Saldo IVA acumulado a la fecha (suma de todos los movimientos IVA del flujo hasta hoy). "A favor" si positivo, "A pagar" si negativo.
2. **Desglose del mes actual:**
   - Credito fiscal: $X
   - Debito fiscal: $Y
3. **Indicador:** Meses de financiamiento restante estimados = saldo acumulado / debito fiscal promedio mensual (ultimos 3 meses)

**Ubicacion:** En el panel de Finanzas, como una card mas junto a las existentes de cuotas vencidas.

## Fuentes de datos

- **Credito fiscal:** `flujo_config` (pedidos JSON con `entregadoAt`) + `compras_precios` via `getMejorPrecio()`
- **Debito fiscal:** `gocuotas_installments.installment_due_at` + `gocuotas_orders` (base GOcelular, pool existente)
- **No requiere tabla nueva** — es un calculo en tiempo real sobre datos existentes

## Archivos a modificar

1. **lib/actions/finanzas.ts**: Nueva funcion `calcularIVAMensual(periodo)` que retorna credito, debito y saldo. Modificar `fetchFlujoDeFondos()` para agregar columna `iva` a cada `FlujoDiario`.
2. **Componente de flujo de fondos**: Agregar columna IVA con estilo violeta diferenciado, antes del neto.
3. **Componente de tarjeta IVA**: Nueva card para el panel de Finanzas con saldo acumulado + desglose + meses restantes.
4. **Tipos**: Agregar campo `iva` a la interface `FlujoDiario`.

## Queries principales

**Credito fiscal del mes:**
```typescript
// Filtrar pedidos con entregadoAt en el mes
const pedidosDelMes = pedidos.filter(p =>
  p.entregadoAt && p.entregadoAt >= primerDia && p.entregadoAt <= ultimoDia
)
// Sumar: cantidad * mejorPrecio * 0.21 por cada item
```

**Debito fiscal del mes:**
```sql
SELECT SUM(i.installment_amount - i.installment_amount / 1.21) AS debito_fiscal
FROM gocuotas_installments i
JOIN gocuotas_orders go ON go.order_id = i.order_id
WHERE i.installment_due_at >= $1
  AND i.installment_due_at < $2
  AND go.order_discarded_at IS NULL
```
