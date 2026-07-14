"use client"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import {
  Award,
  BookOpen,
  Brain,
  ChevronRight,
  Code2,
  FlaskConical,
  Globe,
  GraduationCap,
  Map, MessageCircle,
  MessageSquare,
  Moon,
  Network,
  PlayCircle,
  Search,
  Settings,
  Sun,
  Zap,
} from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

const navGroups = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard",       href: "/",                        icon: Brain },
    ]
  },
  {
    label: "Knowledge Spaces",
    items: [
      { label: "LinkedIn",          href: "/knowledge/linkedin",       icon: Globe },
      { label: "Blogs",             href: "/knowledge/blogs",          icon: BookOpen },
      { label: "Research Papers",   href: "/knowledge/papers",         icon: FlaskConical },
      { label: "Interview Q&A",     href: "/knowledge/interviews",     icon: MessageSquare },
      { label: "AI Notes",          href: "/knowledge/notes",          icon: MessageCircle },

      { label: "GitHub Repos",      href: "/knowledge/github",         icon: Code2 },
      { label: "YouTube",           href: "/knowledge/youtube",        icon: PlayCircle },
      { label: "Courses",           href: "/knowledge/courses",        icon: GraduationCap },
      { label: "Certifications",    href: "/knowledge/certifications", icon: Award },
    ]
  },
  {
    label: "AI Tools",
    items: [
      { label: "Learning Paths",    href: "/learning",                 icon: Map },
      { label: "Brain Talk",        href: "/chat",                     icon: Zap },
      { label: "Brain Search",      href: "/search",                   icon: Search },
      { label: "Knowledge Graph",   href: "/graph",                    icon: Network },
    ]
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <aside className="w-64 h-screen bg-sidebar/50 backdrop-blur-3xl border-r border-sidebar-border flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg glow-violet flex-shrink-0 group-hover:scale-105 transition-transform">
            <Brain size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-none tracking-tight">BrainVault</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">AI Knowledge Brain</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4 [scrollbar-gutter:stable] bg-gradient-to-b from-sidebar/30 via-sidebar-accent/20 to-sidebar/30">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/")

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group",
                      isActive
                        ? "text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-0 bg-sidebar-accent border border-sidebar-primary/20 rounded-lg"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon size={15} className="flex-shrink-0 relative z-10" />
                    <span className="flex-1 truncate relative z-10 font-medium">{item.label}</span>
                    {isActive && <ChevronRight size={11} className="text-sidebar-primary relative z-10 flex-shrink-0" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Settings & Theme */}
      <div className="p-3 border-t border-sidebar-border space-y-1 bg-sidebar backdrop-blur-xl shadow-[0_-6px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_-6px_24px_rgba(0,0,0,0.35)]">
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all"
        >
          {mounted ? (
            theme === "dark" ? <Sun size={15} /> : <Moon size={15} />
          ) : (
            <Moon size={15} />
          )}
          <span className="font-medium">
            {mounted ? (theme === "dark" ? "Light mode" : "Dark mode") : "Dark mode"}
          </span>
        </button>
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all"
        >
          <Settings size={15} />
          <span className="font-medium">Settings</span>
        </Link>
      </div>
    </aside>
  )
}
