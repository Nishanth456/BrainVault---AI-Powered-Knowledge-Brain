"use client"
import { useEffect, useState } from "react"
import { getDashboardStats, type DashboardStats } from "@/lib/api"
import { StatCard } from "@/components/dashboard/StatCard"
import { RecentActivityList } from "@/components/dashboard/RecentActivityList"
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
            <StatCard label="YouTube" value={(stats.by_type.youtube_video || 0) + (stats.by_type.youtube_playlist || 0)} icon="Play" />
            <StatCard label="GitHub" value={stats.by_type.github_repo || 0} icon="GitBranch" />
          </div>
        )}

        {stats && <RecentActivityList items={stats.recent} className="mt-10" />}
      </main>
    </div>
  )
}
