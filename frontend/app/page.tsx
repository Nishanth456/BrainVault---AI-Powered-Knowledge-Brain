"use client"
import { useEffect, useState } from "react"
import { getDashboardStats, type DashboardStats } from "@/lib/api"
import { StatCard } from "@/components/dashboard/StatCard"
import { UniversalInput } from "@/components/dashboard/UniversalInput"
import { Sparkles } from "lucide-react"

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    getDashboardStats().then(setStats).catch(console.error)
  }, [refreshKey])

  return (
    <div className="relative min-h-screen overflow-hidden">
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto text-center pt-8 pb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-600/10 border border-violet-600/20 text-violet-300 text-xs font-semibold mb-8">
            <Sparkles size={12} />
            <span>AI-Powered Knowledge Brain</span>
          </div>

          <h1 className="text-5xl font-bold text-foreground mb-5 leading-tight tracking-tight">
            Capture anything.{" "}
            <span className="gradient-text">Understand everything.</span>
          </h1>

          <p className="text-muted-foreground text-lg mb-12 max-w-xl mx-auto leading-relaxed">
            Paste any URL, text, or file. BrainVault&apos;s AI agents automatically
            extract, classify, and organise it into your personal knowledge brain.
          </p>
        </div>

        <UniversalInput onSubmitted={() => setRefreshKey(k => k + 1)} />

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
            <StatCard label="Total Items" value={stats.total} icon="Brain" />
            <StatCard label="Bookmarked" value={stats.bookmarked} icon="Bookmark" />
            <StatCard label="Notes" value={stats.by_type.note || 0} icon="FileText" />
            <StatCard label="Articles" value={(stats.by_type.blog || 0) + (stats.by_type.linkedin || 0)} icon="BookOpen" />
          </div>
        )}

        {/* ── How it works ───────────────────────────────────────────────────── */}
        <div className="max-w-4xl mx-auto mt-16">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest text-center mb-6">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { step: "01", title: "Paste Anything", desc: "Drop a URL, text, PDF path, or GitHub link into the input above.", icon: "📥" },
              { step: "02", title: "AI Analyses It", desc: "Agents detect the type, extract key concepts, and generate metadata.", icon: "🤖" },
              { step: "03", title: "Knowledge Organised", desc: "Content is stored in the right Knowledge Space — searchable forever.", icon: "🧠" },
            ].map((item) => (
              <div key={item.step} className="relative bg-white/[0.02] border border-white/10 rounded-xl p-5 group hover:border-violet-500/30 transition-all duration-200">
                <div className="text-3xl mb-3">{item.icon}</div>
                <div className="text-xs font-mono text-zinc-500 mb-1">{item.step}</div>
                <h3 className="font-semibold text-white text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
