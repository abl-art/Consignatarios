export default function AfiliadoLiquidacionesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <span className="text-lg font-bold text-magenta-600">GOcelular</span>
          <span className="text-sm text-gray-400 ml-2">Portal de Afiliados</span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
