"use client"
export function ShimmerSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="h-64 rounded-2xl border border-white/[0.05] bg-white/[0.03] overflow-hidden"
        >
          <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent bg-[length:200%_100%]" />
        </div>
      ))}
    </div>
  )
}
