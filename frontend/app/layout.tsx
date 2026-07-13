import { Sidebar } from "@/components/layout/Sidebar"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { AnimatedBackground } from "@/components/ui/AnimatedBackground"
import { Toaster } from "@/components/ui/sonner"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "BrainVault — Your AI-Powered Knowledge Brain",
  description: "Capture anything. Understand everything. Learn forever. BrainVault uses AI agents to automatically extract, classify, and organise every piece of knowledge you consume.",
  keywords: ["knowledge management", "AI", "second brain", "personal knowledge base", "LLM"],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden text-foreground bg-background">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AnimatedBackground />

          {/* Main layout wrapper */}
          <div className="flex w-full h-full relative z-10">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <main className="flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
          </div>

          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
