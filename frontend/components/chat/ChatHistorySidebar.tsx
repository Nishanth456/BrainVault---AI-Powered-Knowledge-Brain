"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MessageSquare, Plus, Trash2 } from "lucide-react"

interface ChatHistorySidebarProps {
  sessions: { id: string; title: string | null }[]
  activeSessionId?: string
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
}

export function ChatHistorySidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
  onDelete,
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
            <div key={session.id} className="group relative flex w-full items-center">
              <button
                onClick={() => onSelect(session.id)}
                className={cn(
                  "flex flex-1 min-w-0 items-center gap-2 rounded-lg py-2 pl-3 pr-8 text-left text-sm transition-colors",
                  activeSessionId === session.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="truncate min-w-0">{session.title || "New chat"}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(session.id)
                }}
                className={cn(
                  "absolute right-2 p-1.5 rounded-md opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive focus:opacity-100 group-hover:opacity-100",
                  activeSessionId === session.id ? "text-primary-foreground hover:text-white" : "text-muted-foreground"
                )}
                title="Delete chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {sessions.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No chat history yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
