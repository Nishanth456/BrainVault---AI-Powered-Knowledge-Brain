import { ChatInterface } from "@/components/chat/ChatInterface"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Brain Talk — BrainVault" }

export default function ChatPage() {
  return (
    <div className="h-full">
      <ChatInterface />
    </div>
  )
}
