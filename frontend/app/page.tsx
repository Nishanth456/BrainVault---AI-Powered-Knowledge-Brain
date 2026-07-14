"use client"
import { useEffect, useState } from "react"
import { getDashboardStats, type DashboardStats } from "@/lib/api"
import { StatCard } from "@/components/dashboard/StatCard"
import { RecentActivityList } from "@/components/dashboard/RecentActivityList"
import { UniversalInput } from "@/components/dashboard/UniversalInput"
import { AnimatedBackground } from "@/components/ui/AnimatedBackground"

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    getDashboardStats().then(setStats).catch(console.error)
  }, [refreshKey])

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AnimatedBackground />
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-3">BrainVault</h1>
          <p className="text-zinc-400">Your AI-powered knowledge brain</p>
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
