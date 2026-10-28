// Catálogo estático de secciones y subitems del panel admin, usado por el
// sistema de permisos (Ver/Operar por usuario): middleware, sidebar y editor
// de permisos consumen esta lista. No depende de datos en runtime: se
// actualiza a mano cada vez que se agrega/renombra una ruta en app/(admin).

export type NivelPermiso = 'ver' | 'operar'

// seccionId -> subitemId -> nivel
export type Permisos = Record<string, Record<string, NivelPermiso>>

// Id de subitem para la página raíz de una sección (página única o hub).
export const SUBITEM_ROOT = 'root'

export type SubitemCatalogo = {
  id: string
  label: string
  ruta?: string
  tab?: string
  operar: boolean
}

export type SeccionCatalogo = {
  id: string
  label: string
  icon: string
  href: string
  external?: boolean
  subitems: SubitemCatalogo[]
}

export const CATALOGO: SeccionCatalogo[] = [
  {
    id: 'novedades',
    label: 'Novedades',
    icon: 'novedades',
    href: '/novedades',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Novedades', ruta: '/novedades', operar: true },
    ],
  },
  {
    id: 'dashboard',
    label: 'Dashboard360',
    icon: 'dashboard',
    href: '/dashboard',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Dashboard360', ruta: '/dashboard', operar: true },
    ],
  },
  {
    id: 'celia',
    label: 'Celia',
    icon: 'celia',
    href: '/celia',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Celia', ruta: '/celia', operar: true },
    ],
  },
  {
    id: 'centro-operaciones',
    label: 'Centro de Operaciones',
    icon: 'sync',
    href: 'https://gocelular.vercel.app/dashboard',
    external: true,
    subitems: [
      { id: SUBITEM_ROOT, label: 'Centro de Operaciones', ruta: 'https://gocelular.vercel.app/dashboard', operar: false },
    ],
  },
  {
    id: 'administrador-gocuotas',
    label: 'Administrador GOcuotas',
    icon: 'consignatarios',
    href: 'https://admin.gocuotas.com/admin/users',
    external: true,
    subitems: [
      { id: SUBITEM_ROOT, label: 'Administrador GOcuotas', ruta: 'https://admin.gocuotas.com/admin/users', operar: false },
    ],
  },
  {
    id: 'carga-simple',
    label: 'Carga Simple',
    icon: 'carga-simple',
    href: 'https://carga-simple.vercel.app/inicio',
    external: true,
    subitems: [
      { id: SUBITEM_ROOT, label: 'Carga Simple', ruta: 'https://carga-simple.vercel.app/inicio', operar: false },
    ],
  },
  {
    id: 'canales',
    label: 'Canales de Comercialización',
    icon: 'tienda',
    href: '/canales',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Canales de Comercialización', ruta: '/canales', operar: true },
      { id: 'tienda', label: 'Tienda Online', ruta: '/canales/tienda', operar: true },
      { id: 'afiliados', label: 'Afiliados', ruta: '/canales/afiliados', operar: true },
      { id: 'proyeccion', label: 'Proyección de Ventas', ruta: '/canales/proyeccion', operar: true },
      { id: 'lista-precios', label: 'Lista de Precios', ruta: '/canales/lista-precios', operar: true },
    ],
  },
  // Hub propio con 4 subrutas (/mayoristas/*); su página hub vive en
  // /canales/mayoristas (tarjeta "Mayoristas" dentro de Canales).
  {
    id: 'mayoristas',
    label: 'Mayoristas',
    icon: 'dashboard',
    href: '/canales/mayoristas',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Mayoristas', ruta: '/canales/mayoristas', operar: true },
      { id: 'clientes', label: 'Clientes', ruta: '/mayoristas/clientes', operar: true },
      { id: 'proformas', label: 'Proformas', ruta: '/mayoristas/proformas', operar: true },
      { id: 'asignaciones', label: 'Asignaciones', ruta: '/mayoristas/asignaciones', operar: true },
      { id: 'lista-precios', label: 'Lista de Precios', ruta: '/mayoristas/lista-precios', operar: true },
    ],
  },
  {
    id: 'alertas-fraudes',
    label: 'Alertas y Fraudes',
    icon: 'diferencias',
    href: '/alertas-fraudes',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Alertas y Fraudes', ruta: '/alertas-fraudes', operar: true },
    ],
  },
  {
    id: 'compras',
    label: 'Compras',
    icon: 'fabrica',
    href: '/compras',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Compras', ruta: '/compras', operar: true },
      { id: 'proveedores', label: 'Proveedores', ruta: '/compras/proveedores', operar: true },
      { id: 'modelos', label: 'Modelos y Precios', ruta: '/compras/modelos', operar: true },
      { id: 'gestor', label: 'Gestor de Pedidos', ruta: '/compras/gestor', operar: true },
      { id: 'envios', label: 'Envíos', ruta: '/compras/envios', operar: true },
      { id: 'cta-cte-ns', label: 'Cta Cte Prov NS', ruta: '/compras/cta-cte-ns', operar: true },
      { id: 'forecast', label: 'Forecast de Compras', ruta: '/compras/forecast', operar: true },
      { id: 'manual', label: 'Manual operativo', ruta: '/compras/manual', operar: false },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: 'inventario',
    href: '/inventario',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Inventario', ruta: '/inventario', operar: true },
      { id: 'stock', label: 'Stock', ruta: '/inventario/stock', operar: true },
      { id: 'kits-seguridad', label: 'Kits de Seguridad', ruta: '/inventario/kits-seguridad', operar: true },
      { id: 'gestion', label: 'Gestión', ruta: '/inventario/gestion', operar: true },
    ],
  },
  {
    id: 'auditoria-stock',
    label: 'Auditoría de Stock',
    icon: 'dashboard',
    href: '/auditoria-stock',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Auditoría de Stock', ruta: '/auditoria-stock', operar: true },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    icon: 'finanzas',
    href: '/finanzas',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Finanzas', ruta: '/finanzas', operar: true },
      { id: 'flujo', label: 'Flujo de fondos', tab: 'flujo', operar: true },
      { id: 'egresos', label: 'Egresos', tab: 'egresos', operar: true },
      { id: 'deuda', label: 'Deuda', tab: 'deuda', operar: true },
      { id: 'indicadores', label: 'Payment Defaults', tab: 'indicadores', operar: false },
      { id: 'dpd', label: 'Days Past Due', tab: 'dpd', operar: false },
      { id: 'vintage', label: 'Vintage', tab: 'vintage', operar: false },
      { id: 'simulador', label: 'Simulación', tab: 'simulador', operar: true },
      { id: 'precios', label: 'Productos', tab: 'precios', operar: true },
      { id: 'resultado', label: 'Resultado', tab: 'resultado', operar: true },
    ],
  },
  {
    id: 'seguros',
    label: 'Seguros',
    icon: 'seguros',
    href: '/seguros',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Seguros', ruta: '/seguros', operar: true },
    ],
  },
  {
    id: 'sync',
    label: 'Sincronización',
    icon: 'sync',
    href: '/sync',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Sincronización', ruta: '/sync', operar: true },
    ],
  },
  {
    id: 'documentacion',
    label: 'Documentación',
    icon: 'documento',
    href: '/documentacion',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Documentación', ruta: '/documentacion', operar: true },
    ],
  },
  {
    id: 'notas',
    label: 'Notas y Pendientes',
    icon: 'reloj',
    href: '/notas',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Notas y Pendientes', ruta: '/notas', operar: true },
    ],
  },
  {
    id: 'reclutamiento',
    label: 'Reclutamiento',
    icon: 'consignatarios',
    href: '/reclutamiento',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Reclutamiento', ruta: '/reclutamiento', operar: true },
    ],
  },
  {
    id: 'knox-guard',
    label: 'Knox Guard',
    icon: 'diferencias',
    href: '/knox-guard',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Knox Guard', ruta: '/knox-guard', operar: true },
    ],
  },
  {
    id: 'grupo-go',
    label: 'Grupo GO',
    icon: 'dashboard',
    href: '/grupo-go',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Grupo GO', ruta: '/grupo-go', operar: true },
      { id: 'dashboard', label: 'Dashboard', ruta: '/grupo-go/dashboard', operar: true },
      { id: 'pnl', label: 'PNL Mensual', ruta: '/grupo-go/pnl', operar: true },
    ],
  },
  {
    id: 'consignatarios',
    label: 'Consignatarios',
    icon: 'dashboard',
    href: '/consignatarios',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Consignatarios', ruta: '/consignatarios', operar: true },
      { id: 'lista', label: 'Listado', ruta: '/consignatarios/lista', operar: true },
      { id: 'dashboard', label: 'Dashboard', ruta: '/consignatarios/dashboard', operar: true },
      { id: 'asignaciones', label: 'Asignaciones', ruta: '/consignatarios/asignaciones', operar: true },
      { id: 'devoluciones', label: 'Devoluciones', ruta: '/consignatarios/devoluciones', operar: true },
      { id: 'credenciales', label: 'Credenciales', ruta: '/consignatarios/credenciales', operar: true },
    ],
  },
  {
    id: 'diferencias',
    label: 'Diferencias',
    icon: 'dashboard',
    href: '/diferencias',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Diferencias', ruta: '/diferencias', operar: true },
    ],
  },
  {
    id: 'garantias',
    label: 'Garantías',
    icon: 'dashboard',
    href: '/garantias',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Garantías', ruta: '/garantias', operar: true },
    ],
  },
  {
    id: 'liquidaciones',
    label: 'Liquidaciones',
    icon: 'dashboard',
    href: '/liquidaciones',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Liquidaciones', ruta: '/liquidaciones', operar: true },
    ],
  },
  {
    id: 'modelos',
    label: 'Modelos y Precios',
    icon: 'dashboard',
    href: '/modelos',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Modelos y Precios', ruta: '/modelos', operar: true },
    ],
  },
  {
    id: 'pase-contabilidad',
    label: 'Pase a Contabilidad',
    icon: 'dashboard',
    href: '/pase-contabilidad',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Pase a Contabilidad', ruta: '/pase-contabilidad', operar: true },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: 'dashboard',
    href: '/reportes',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Reportes', ruta: '/reportes', operar: true },
    ],
  },
  {
    id: 'segmentos',
    label: 'Segmentos de Clientes',
    icon: 'dashboard',
    href: '/segmentos',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Segmentos de Clientes', ruta: '/segmentos', operar: true },
    ],
  },
  {
    id: 'terceros',
    label: 'Venta a Terceros',
    icon: 'ventas',
    href: '/terceros',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Venta a Terceros', ruta: '/terceros', operar: true },
    ],
  },
  {
    id: 'upselling',
    label: 'Upselling',
    icon: 'dashboard',
    href: '/upselling',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Upselling', ruta: '/upselling', operar: true },
    ],
  },
  {
    id: 'ventas',
    label: 'Ventas',
    icon: 'dashboard',
    href: '/ventas',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Ventas', ruta: '/ventas', operar: true },
    ],
  },
  {
    id: 'auditorias',
    label: 'Auditorías',
    icon: 'dashboard',
    href: '/auditorias',
    subitems: [
      { id: SUBITEM_ROOT, label: 'Auditorías', ruta: '/auditorias', operar: true },
    ],
  },
]
