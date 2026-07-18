export default function Loading() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-pulse">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
        <div className="h-7 w-48 bg-gray-200 rounded mt-2" />
        <div className="flex gap-2 mt-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-8 w-20 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 px-5 py-5">
          <div className="h-4 w-40 bg-gray-200 rounded mb-6" />
          <div className="flex flex-col items-center gap-3">
            <div className="w-full h-14 bg-blue-100 rounded-t-xl" />
            <div className="w-[85%] h-14 bg-indigo-100" />
            <div className="w-[65%] h-14 bg-amber-100" />
            <div className="w-[40%] h-14 bg-emerald-100 rounded-b-xl" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-5">
          <div className="h-4 w-24 bg-gray-200 rounded mb-5" />
          <div className="h-10 w-40 bg-gray-200 rounded mb-4" />
          <div className="h-8 w-32 bg-gray-200 rounded" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-4 w-24 bg-gray-200 rounded" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-8 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  )
}
