"use client"
import { motion } from "framer-motion"
import { ReactNode } from "react"

export function StaggeredCardGrid({ children, singleColumn = false }: { children: ReactNode, singleColumn?: boolean }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.05 } },
      }}
      className={singleColumn ? "flex flex-col gap-4" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"}
    >
      {children}
    </motion.div>
  )
}

export function StaggeredCardItem({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
      }}
    >
      {children}
    </motion.div>
  )
}
