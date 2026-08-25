// Pestaña "Alertas" de /compras/envios: pedidos a Andreani que necesitan
// intervención manual.
//   requires_attention  = el WH los marcó con un problema (campo razon)
//   expedido sin IMEI   = Andreani despachó pero nunca se registró qué equipo
//                         salió: el stock queda inflado hasta resolverlo

export interface AlertaEnvioRaw {
  estado: 'requires_attention' | 'expedido'
  orderNumber: string
  clienteNombre: string | null
  clienteDni: string | null
  clienteTelefono: string | null
  producto: string | null
  ciudad: string | null
  provincia: string | null
  paidAt: string | null
  sentAt: string | null
  ordenWh: string | null
  razon: string | null
  tracking: string | null
  shipmentStatus: string | null
  shipmentError: string | null
  admittedAt: string | null
}

export interface AlertaEnvio {
  orderNumber: string
  cliente: string
  dni: string | null
  telefono: string | null
  producto: string | null
  destino: string
  paidAt: string | null
  sentAt: string | null
  ordenWh: string | null
  razon: string | null
  tracking: string | null
  shipmentStatus: string | null
  shipmentError: string | null
  admittedAt: string | null
  diasPendiente: number
}

const DIA_MS = 24 * 60 * 60 * 1000

function armar(r: AlertaEnvioRaw, ahora: Date): AlertaEnvio {
  const base = r.sentAt ?? r.paidAt
  return {
    orderNumber: r.orderNumber,
    cliente: (r.clienteNombre ?? '').replace(/\s+/g, ' ').trim(),
    dni: r.clienteDni,
    telefono: r.clienteTelefono,
    producto: r.producto,
    destino: [r.ciudad, r.provincia].filter(Boolean).join(', '),
    paidAt: r.paidAt,
    sentAt: r.sentAt,
    ordenWh: r.ordenWh,
    razon: r.razon,
    tracking: r.tracking,
    shipmentStatus: r.shipmentStatus,
    shipmentError: r.shipmentError,
    admittedAt: r.admittedAt,
    diasPendiente: base ? Math.max(0, Math.floor((ahora.getTime() - new Date(base).getTime()) / DIA_MS)) : 0,
  }
}

export function armarAlertasEnvios(
  rows: AlertaEnvioRaw[],
  ahora: Date,
): { requierenAtencion: AlertaEnvio[]; expedidosSinImei: AlertaEnvio[] } {
  const masViejoPrimero = (a: AlertaEnvio, b: AlertaEnvio) => b.diasPendiente - a.diasPendiente
  return {
    requierenAtencion: rows.filter(r => r.estado === 'requires_attention').map(r => armar(r, ahora)).sort(masViejoPrimero),
    expedidosSinImei: rows.filter(r => r.estado === 'expedido').map(r => armar(r, ahora)).sort(masViejoPrimero),
  }
}
