"use client"

import { Button } from "@/components/ui/button"

import { cn } from "@/lib/utils"
import { MessageSquare, Plus } from "lucide-react"

interface ChatHistorySidebarProps {
  sessions: { id: string; title: string | null }[]
  activeSessionId?: string
  onSelect: (id: string) => void
  onNewChat: () => void
}

export function ChatHistorySidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
}: ChatHistorySidebarProps) {
  return (
    <div className="hidden w-64 flex-col gap-3 rounded-xl border bg-card p-3 md:flex overflow-hidden min-h-0 h-full">
      <Button variant="outline" className="w-full justify-start gap-2" onClick={onNewChat}>
        <Plus className="h-4 w-4" />
        New chat
      </Button>

      <div className="flex-1 overflow-y-auto pr-2">
        <div className="space-y-1">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                activeSessionId === session.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">{session.title || "New chat"}</span>
            </button>
          ))}

          {sessions.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No chat history yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
