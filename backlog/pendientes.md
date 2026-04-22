# Backlog GOcelular360

## Prioridad Alta

### Escaneo por cámara de IMEIs
- Integrar librería html5-qrcode o similar para leer códigos de barras/IMEI con la cámara del celular
- En la página de asignar stock (admin): opción de escanear además de ingresar manualmente
- En el panel del consignatario: la cámara debe ser OBLIGATORIA (no permitir ingreso manual para evitar que anoten IMEIs)

### Panel de devoluciones
- UI para que el admin marque equipos como devueltos por el consignatario
- Notificar a GOcelular para reingresar al stock disponible
- Backend ya está listo (función `devolverEquipo` en lib/actions/asignar.ts)

### Cámara obligatoria para consignatarios
- En auto-auditoría: el consignatario debe escanear los IMEIs con la cámara
- No puede cargar IMEIs manualmente — solo escaneando el equipo físico

### P&L (Estado de Resultados mensual)
- Nueva pestaña en Finanzas con P&L mensual
- **Estructura:**
  - **Ventas netas** (de GOcelular, sin IVA)
  - **(-) Costo de mercadería vendida** (CMV = existencia inicial + compras del período - existencia final)
  - **= Margen bruto**
  - **(-) Costos operativos** (sueldos, envíos, licencias, descartables, otros del cashflow)
  - **(-) Resultados financieros** (intereses de deuda)
  - **(-) Incobrables** (mora/contracargos)
  - **(-) Costos impositivos:**
    - Imp. créditos: 0.6% sobre ingresos
    - Imp. débitos: 0.6% sobre egresos
    - IIBB: 4% sobre venta neta
  - **= Resultado neto**
- **Datos necesarios que ya tenemos:**
  - Ventas: GOcelular DB (fetchVentasHistoricas)
  - Compras: pedidos del gestor de compras (flujo_config pedido_*)
  - Costos operativos: flujo_egresos por concepto
  - Intereses: deuda_movimientos tipo='interes'
  - Incobrables: fetchContracargos de GOcelular
  - Stock: dispositivos por estado + inventory_items de GOcelular
- **Dato nuevo a guardar:**
  - Existencia final de cada mes (snapshot último día del mes): crear tabla o guardar en flujo_config como `existencia_YYYY-MM` con valor del stock valorizado a costo
  - Automatizar: al cargar Finanzas, si es último día del mes y no existe snapshot, generarlo

### Cron automático sync consignatarios (cada hora)
- API route ya creada en `/api/cron/sync` con CRON_SECRET configurado en Vercel
- `vercel.json` ya tiene el cron definido (`0 * * * *`)
- **Bloqueado por plan Hobby**: Vercel Hobby solo permite crons diarios
- **Acción**: upgrade a Vercel Pro ($20/mes) y el cron se activa automáticamente
- Mientras tanto: sync manual desde `/sync`

### Curva de incobrabilidad histórica por cuota
- Cuando haya datos reales de varios meses operando, reemplazar incobrabilidad proporcional por curva real por número de cuota
- Usar datos de PD/DPD que ya tenemos en Finanzas
- Aplicar al simulador financiero para mayor precisión

### Monte Carlo completo
- Simulación de riesgo de portfolio con correlaciones entre variables
- Requiere volumen de datos históricos significativo
- Útil para modelar escenarios extremos y stress testing

## Prioridad Media

### Endpoint de GOcelular
- Pedirle a GOcuotas el endpoint para notificar asignaciones/devoluciones
- Configurar en flujo_config key 'gocelular_assign_endpoint'
- Payload ya definido: { action, imeis, consignatario, timestamp }

### Prophet para forecast
- Cuando Railway tenga más RAM o plan pago, migrar de modelo liviano a Prophet
- Necesita 6+ meses de datos para estacionalidad real
- El microservicio ya está en Railway (gocelular-forecast)

### Sincronización automática
- Configurar sync automático de ventas desde GOcelular
- Actualmente es manual desde /sync

## Prioridad Baja

### Categorías de inventario
- Completar Smartwatches, Parlantes, Auriculares con datos reales cuando se incorporen
- Misma lógica que celulares pero sin consignación por ahora

### Email integration
- El envío por email usa mailto: que depende del cliente de mail del sistema
- Evaluar integración con SendGrid/Resend para envío directo desde la app
