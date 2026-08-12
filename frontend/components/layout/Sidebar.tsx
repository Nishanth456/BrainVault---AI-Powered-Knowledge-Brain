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
  PlayCircle,
  Search,
  Sun,
  User,
  Zap,
  Menu,
  X,
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
      { label: "Profile",          href: "/profile",                  icon: User },
    ]
  },
  {
    label: "Knowledge Spaces",
    items: [
      { label: "LinkedIn",          href: "/knowledge/linkedin",       icon: Globe },
      { label: "Blogs",             href: "/knowledge/blogs",          icon: BookOpen },
      { label: "Research Papers",   href: "/knowledge/papers",         icon: FlaskConical },
      { label: "Interview Q&A",     href: "/knowledge/interviews",     icon: MessageSquare },
      { label: "Notes",             href: "/knowledge/notes",          icon: MessageCircle },
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
    ]
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <>
      {/* Mobile Toggle Button (outside) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="md:hidden fixed top-4 left-4 z-40 p-2 rounded-xl bg-background/80 backdrop-blur-md border border-border text-foreground shadow-sm"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={cn(
        "w-64 h-screen bg-sidebar/50 backdrop-blur-3xl border-r border-sidebar-border flex flex-col flex-shrink-0 transition-transform duration-300 z-50",
        "fixed md:relative top-0 left-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Logo */}
      <div className="p-5 border-b border-sidebar-border flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-3 group flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg glow-violet flex-shrink-0 group-hover:scale-105 transition-transform">
            <Brain size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sidebar-foreground text-sm leading-none tracking-tight truncate">BrainVault</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium truncate">AI Knowledge Brain</p>
          </div>
        </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              title={mounted ? (theme === "dark" ? "Light mode" : "Dark mode") : "Dark mode"}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all flex-shrink-0"
            >
              {mounted ? (
                theme === "dark" ? <Sun size={16} /> : <Moon size={16} />
              ) : (
                <Moon size={16} />
              )}
            </button>
            
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-all flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
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
                  : pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 group",
                      isActive
                        ? "text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
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

      {/* Watermark */}
      <div className="p-4 border-t border-sidebar-border mt-auto">
        <p className="text-center text-xs text-muted-foreground/60 leading-relaxed">
          Designed and Developed by<br/>
          <span className="font-medium text-muted-foreground/80">Nishanth Gadey</span>
        </p>
      </div>

      </aside>
    </>
  )
}
