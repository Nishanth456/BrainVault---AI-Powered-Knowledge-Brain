"use client"
import * as LucideIcons from "lucide-react"

export function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  const Icon = (LucideIcons as any)[icon] || LucideIcons.Circle

  return (
    <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 flex items-center gap-4 hover:bg-zinc-800 transition-colors group">
      <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
        <Icon size={24} className="text-violet-400" />
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mt-0.5">{label}</div>
      </div>
    </div>
  )
}
