export function validarIMEI(imei: string): boolean {
  return /^\d{15}$/.test(imei)
}

export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(monto)
}

export function calcularPrecioVenta(precioCosto: number, multiplicador: number): number {
  return precioCosto * multiplicador
}

export function primerDiaHabil(year: number, month: number): Date {
  const date = new Date(year, month, 1)
  // 0 = domingo, 6 = sábado
  if (date.getDay() === 0) date.setDate(2)
  else if (date.getDay() === 6) date.setDate(3)
  return date
}
