"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"

interface Flake {
  id: number
  x: number
  delay: number
  duration: number
  size: number
  opacity: number
}

export function AnimatedBackground() {
  const [flakes, setFlakes] = useState<Flake[]>([])

  useEffect(() => {
    // Generate flakes only on the client to avoid hydration mismatch
    const generatedFlakes = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // Random starting X position (vw)
      delay: Math.random() * 20, // Random animation start delay
      duration: 10 + Math.random() * 20, // Fall duration between 10s and 30s
      size: 2 + Math.random() * 3, // Flake size (2px - 5px)
      opacity: 0.1 + Math.random() * 0.3, // Opacity (10% - 40%)
    }))
    setFlakes(generatedFlakes)
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Background base color */}
      <div className="absolute inset-0 bg-background" />

      {/* Falling Flakes (Data Rain) */}
      {flakes.map((flake) => (
        <motion.div
          key={flake.id}
          className="absolute top-[-5%] rounded-full bg-white blur-[1px]"
          style={{
            left: `${flake.x}vw`,
            width: flake.size,
            height: flake.size,
            opacity: flake.opacity,
          }}
          animate={{
            y: ["0vh", "110vh"],
          }}
          transition={{
            duration: flake.duration,
            repeat: Infinity,
            delay: flake.delay,
            ease: "linear",
          }}
        />
      ))}
      
      {/* Orb 1: Primary Violet */}
      <motion.div
        className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary/20 blur-[120px]"
        animate={{
          x: [0, 100, 0],
          y: [0, 50, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Orb 2: Teal/Cyan */}
      <motion.div
        className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[oklch(0.65_0.2_195)]/15 blur-[120px]"
        animate={{
          x: [0, -100, 0],
          y: [0, -50, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      {/* Orb 3: Deep Blue */}
      <motion.div
        className="absolute top-[30%] left-[60%] w-[40vw] h-[40vw] rounded-full bg-[oklch(0.55_0.25_265)]/15 blur-[100px]"
        animate={{
          x: [0, -50, 50, 0],
          y: [0, 100, -50, 0],
          scale: [1, 1.3, 0.9, 1],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Noise texture overlay for premium feel */}
      <div 
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
        }}
      />
    </div>
  )
}
