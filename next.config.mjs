/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
    // El manual operativo (HTML con capturas embebidas) se sirve por una
    // ruta autenticada que lo lee de docs/ — incluirlo en el bundle
    outputFileTracingIncludes: {
      '/canales/lista-precios/manual': ['./docs/manual-lista-precios/manual-inline.html'],
      '/compras/envios/manual': ['./docs/manual-envios-posventa/manual-inline.html'],
      '/compras/manual': ['./docs/manual-compras/manual-inline.html'],
    },
  },
};

export default nextConfig;
