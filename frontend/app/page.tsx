import { UniversalInput } from "@/components/dashboard/UniversalInput"
import { Brain, Zap, Database, BookOpen, Sparkles } from "lucide-react"

const stats = [
  { label: "Knowledge Items", value: "0", icon: Database, color: "text-violet-400", bg: "bg-violet-500/10" },
  { label: "Domains Covered", value: "0",  icon: Brain,    color: "text-cyan-400",   bg: "bg-cyan-500/10"   },
  { label: "Agents Ready",    value: "8",  icon: Zap,      color: "text-emerald-400", bg: "bg-emerald-500/10" },
]

export default function DashboardPage() {
  return (
    <div className="min-h-screen p-8">
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto text-center pt-16 pb-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-600/10 border border-violet-600/20 text-violet-300 text-xs font-semibold mb-8">
          <Sparkles size={12} />
          <span>AI-Powered Knowledge Brain</span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl font-bold text-foreground mb-5 leading-tight tracking-tight">
          Capture anything.{" "}
          <span className="gradient-text">Understand everything.</span>
        </h1>

        <p className="text-muted-foreground text-lg mb-12 max-w-xl mx-auto leading-relaxed">
          Paste any URL, text, or file. BrainVault&apos;s AI agents automatically
          extract, classify, and organise it into your personal knowledge brain.
        </p>

        {/* Universal Input */}
        <UniversalInput />
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-card border border-border rounded-xl p-5 text-center hover:border-violet-500/20 transition-all duration-200"
          >
            <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mx-auto mb-3`}>
              <stat.icon size={18} className={stat.color} />
            </div>
            <p className="text-3xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto mt-16">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center mb-6">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: "01", title: "Paste Anything", desc: "Drop a URL, text, PDF path, or GitHub link into the input above.", icon: "📥" },
            { step: "02", title: "AI Analyses It", desc: "Agents detect the type, extract key concepts, and generate metadata.", icon: "🤖" },
            { step: "03", title: "Knowledge Organised", desc: "Content is stored in the right Knowledge Space — searchable forever.", icon: "🧠" },
          ].map((item) => (
            <div key={item.step} className="relative bg-card border border-border rounded-xl p-5 group hover:border-violet-500/20 transition-all duration-200">
              <div className="text-3xl mb-3">{item.icon}</div>
              <div className="text-xs font-mono text-muted-foreground mb-1">{item.step}</div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
