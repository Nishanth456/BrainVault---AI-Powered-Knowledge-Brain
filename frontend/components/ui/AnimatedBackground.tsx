"use client"

import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function AnimatedBackground() {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const isDark = mounted ? theme === "dark" : true

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
      {/* Inline CSS — all animations are pure CSS, zero JS cost */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .bg-orb, .bg-flake { animation: none !important; }
        }

        @keyframes orb-drift-1 {
          0%   { transform: translate(0px, 0px) scale(1); }
          50%  { transform: translate(80px, 40px) scale(1.08); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes orb-drift-2 {
          0%   { transform: translate(0px, 0px) scale(1); }
          50%  { transform: translate(-70px, -35px) scale(1.12); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes orb-drift-3 {
          0%   { transform: translate(0px, 0px) scale(1); }
          33%  { transform: translate(-40px, 70px) scale(1.2); }
          66%  { transform: translate(40px, -30px) scale(0.92); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes flake-fall {
          0%   { transform: translateY(-5vh); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(110vh); opacity: 0; }
        }

        .bg-orb-1 {
          animation: orb-drift-1 20s ease-in-out infinite;
        }
        .bg-orb-2 {
          animation: orb-drift-2 26s ease-in-out infinite;
        }
        .bg-orb-3 {
          animation: orb-drift-3 32s ease-in-out infinite;
        }

        /* 12 particles — each offset via animation-delay */
        .bg-flake-0  { left: 5vw;  animation: flake-fall 18s linear 0s infinite; }
        .bg-flake-1  { left: 13vw; animation: flake-fall 22s linear 3s infinite; }
        .bg-flake-2  { left: 21vw; animation: flake-fall 15s linear 7s infinite; }
        .bg-flake-3  { left: 30vw; animation: flake-fall 25s linear 1s infinite; }
        .bg-flake-4  { left: 40vw; animation: flake-fall 19s linear 12s infinite; }
        .bg-flake-5  { left: 50vw; animation: flake-fall 28s linear 5s infinite; }
        .bg-flake-6  { left: 60vw; animation: flake-fall 16s linear 9s infinite; }
        .bg-flake-7  { left: 68vw; animation: flake-fall 23s linear 2s infinite; }
        .bg-flake-8  { left: 76vw; animation: flake-fall 20s linear 15s infinite; }
        .bg-flake-9  { left: 83vw; animation: flake-fall 17s linear 6s infinite; }
        .bg-flake-10 { left: 90vw; animation: flake-fall 24s linear 11s infinite; }
        .bg-flake-11 { left: 96vw; animation: flake-fall 21s linear 4s infinite; }
      `}</style>

      {/* Background base */}
      <div className={cn(
        "absolute inset-0",
        isDark ? "bg-background" : "bg-gradient-to-br from-slate-100 via-white to-violet-50"
      )} />

      {/* 12 CSS-only falling flakes (was 40 Framer Motion loops) */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            `bg-flake-${i}`,
            "absolute top-0 rounded-full",
            isDark ? "bg-white/20" : "bg-foreground/15"
          )}
          style={{
            width: 2 + (i % 3),
            height: 2 + (i % 3),
          }}
        />
      ))}

      {/* Orb 1 — Primary Violet */}
      <div
        className={cn(
          "bg-orb-1 absolute top-[-15%] left-[-8%] w-[40vw] h-[40vw] rounded-full",
          isDark ? "bg-primary/20" : "bg-primary/10"
        )}
        style={{ filter: "blur(80px)" }}
      />

      {/* Orb 2 — Teal/Cyan */}
      <div
        className={cn(
          "bg-orb-2 absolute bottom-[-15%] right-[-8%] w-[45vw] h-[45vw] rounded-full",
          isDark
            ? "bg-[oklch(0.65_0.2_195)]/15"
            : "bg-[oklch(0.65_0.2_195)]/8"
        )}
        style={{ filter: "blur(90px)" }}
      />

      {/* Orb 3 — Deep Blue */}
      <div
        className={cn(
          "bg-orb-3 absolute top-[30%] left-[55%] w-[30vw] h-[30vw] rounded-full",
          isDark
            ? "bg-[oklch(0.55_0.25_265)]/15"
            : "bg-[oklch(0.55_0.25_265)]/8"
        )}
        style={{ filter: "blur(80px)" }}
      />

      {/* Noise texture overlay */}
      <div
        className={cn(
          "absolute inset-0 mix-blend-overlay",
          isDark ? "opacity-[0.03]" : "opacity-[0.02]"
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />
    </div>
  )
}
