export type EstadoDispositivo = 'disponible' | 'asignado' | 'vendido' | 'devuelto'
export type EstadoAuditoria = 'borrador' | 'confirmada'
export type TipoAuditoria = 'fisica' | 'auto'
export type TipoDiferencia = 'faltante' | 'sobrante'
export type EstadoDiferencia = 'pendiente' | 'cobrado' | 'resuelto'
export type EstadoLiquidacion = 'retenida' | 'pendiente' | 'bloqueada' | 'pagada'
export type EstadoSync = 'running' | 'ok' | 'error'

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
  garantia: number
  store_prefix: string | null
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
  fecha_asignacion: string | null
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
  store_name: string | null
  synced_at: string
}

export interface SyncLog {
  id: string
  started_at: string
  finished_at: string | null
  status: EstadoSync
  ventas_nuevas: number
  ventas_ya_existentes: number
  dispositivos_no_encontrados: number
  errores_monitoreo: number
  error_msg: string | null
  detalle: {
    store_mismatches?: { imei: string; expected_prefix: string; actual_store: string }[]
  } | null
  created_by: string | null
}

export interface Auditoria {
  id: string
  consignatario_id: string
  realizada_por: string
  fecha: string
  estado: EstadoAuditoria
  tipo: TipoAuditoria
  firma_url: string | null
  documento_url: string | null
  observaciones: string | null
  created_at: string
}

export interface Liquidacion {
  id: string
  consignatario_id: string
  mes: string
  total_comisiones: number
  total_diferencias_descontadas: number
  monto_a_pagar: number
  estado: EstadoLiquidacion
  fecha_auto_auditoria: string | null
  fecha_pago: string | null
  firma_url: string | null
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
