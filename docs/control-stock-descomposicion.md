# Control Stock — capa de descomposición de diferencias

Implementado 17/9/2026. Reemplaza la clasificación por persistencia de la dif cruda
(que confundía putaway con faltantes: mostraba 107 u "reales" cuando ~98 eran putaway).

## Modelo

Cada diferencia por modelo (`and_disponible − go_andreani`, ya neteada de cruces de
color) se descompone en causas conocidas + residual, con **cap = |dif|** (nunca
explicar más de lo que la dif muestra).

Para una **dif negativa** (GO cuenta de más), con `deuda = |dif|`:
1. **Fantasmas** (despachos sin IMEI, `control_stock_ajustes` vigentes): `min(fantasmas, deuda)`.
2. **Putaway** (recepción que Andreani no ingresó a su total): `min(go_comparable − and_total − fantasmas, recepción48h, deuda)`.
3. **Residual** = lo que queda = lag de novedad pendiente o fantasma no catalogado.

Una **dif positiva** (Andreani cuenta de más) va entera al residual (reingreso de
rescate/devolución no registrado).

El clasificador de persistencia opera sobre el **residual**, no sobre la dif cruda:
un residual que persiste ≥2 cortes con mismo signo = real; uno que desaparece era lag.

## Por qué esto y no otra cosa

- **API de Andreani confiable**: 30/30 SKUs coinciden exacto con el export del portal
  (17/9). El ruido era nuestro comparable, no los datos.
- **`and_disponible` = físico − pickeado**, NO descuenta la cola de enviados sin
  pickear (verificado contra el portal). Por eso el comparable ya no resta `go_enviados`
  (commit 52d80b7).
- **No se puede reconstruir `go_andreani` a un instante pasado**: `inventory_actions_log`
  no historiza asignaciones retail ni cambios de ubicación. El residual de timing/lag
  solo se resuelve por persistencia entre cortes, no en el momento.

## Mantenimiento de la lista de fantasmas

`control_stock_ajustes` (sku, so_ref, unidades, motivo, vigente). Se carga a mano desde
las novedades de Pedro (texto libre → lo parsea el asistente). Cuando Pedro compensa un
fantasma, marcar `vigente = false`. El cap hace que un fantasma ya resuelto no genere
residual positivo falso, pero conviene retirarlo igual.

## Archivos

- `scripts/control-stock-ajustes.sql` — tabla + 11 fantasmas iniciales (novedad 16/9)
- `lib/control-stock.ts` — `descomponerModelos`, `andTotal` en `ModeloNeto`, clasificación sobre residual
- `lib/actions/control-stock.ts` — fetch de ajustes vigentes → `fantasmas` por modelo
- `app/(admin)/compras/envios/ControlStockTable.tsx` — tarjeta muestra residual + columnas de desglose
- `__tests__/control-stock.test.ts` — 19 tests

## Resultado (corte 17/9 09:44)

"Diferencias reales": **107 u → 3 u**. G06 128 (−53) y G17 128 (−45) se explican como
putaway; queda Note 14 −2 y A17 5G −1 (residual real) + G06 64 +6 (reingreso a investigar).
