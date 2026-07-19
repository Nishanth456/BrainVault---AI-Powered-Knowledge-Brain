"use client"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
    getChatSession,
    listChatSessions,
    sendChatMessage,
    type ChatMessage,
    type SearchResultItem,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import { Loader2, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ChatHistorySidebar } from "./ChatHistorySidebar"
import { SourceCitationCard } from "./SourceCitationCard"
import { StreamingMessage } from "./StreamingMessage"
import { SuggestedQuestions } from "./SuggestedQuestions"

interface ChatInterfaceProps {
  initialSessionId?: string
  initialFilters?: { types?: string[] }
}

export function ChatInterface({ initialSessionId, initialFilters }: ChatInterfaceProps) {
  const [sessions, setSessions] = useState<{ id: string; title: string | null }[]>([])
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [citations, setCitations] = useState<SearchResultItem[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    if (sessionId) {
      getChatSession(sessionId).then((session) => {
        setMessages(session.messages)
        setCitations([])
      })
    }
  }, [sessionId])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isStreaming])

  async function loadSessions() {
    try {
      const data = await listChatSessions()
      setSessions(data.sessions)
    } catch (e) {
      console.error("Failed to load sessions", e)
    }
  }

  function handleSend() {
    if (!input.trim() || isStreaming) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      citations: [],
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsStreaming(true)
    setCitations([])

    let streamedContent = ""
    let finalCitations: SearchResultItem[] = []

    const abort = sendChatMessage(
      userMessage.content,
      {
        onToken: (token: string) => {
          streamedContent += token
          setMessages((prev) => {
            const others = prev.filter((m) => m.id !== "streaming")
            return [
              ...others,
              {
                id: "streaming",
                role: "assistant",
                content: streamedContent,
                citations: [],
                created_at: new Date().toISOString(),
              },
            ]
          })
        },
        onCitations: (cits: SearchResultItem[]) => {
          finalCitations = cits
          setCitations(cits)
        },
        onDone: (sid: string) => {
          setSessionId(sid)
          setIsStreaming(false)
          setMessages((prev) => {
            const others = prev.filter((m) => m.id !== "streaming")
            return [
              ...others,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: streamedContent,
                citations: finalCitations,
                created_at: new Date().toISOString(),
              },
            ]
          })
          loadSessions()
        },
        onError: (err) => {
          console.error("Chat error", err)
          setIsStreaming(false)
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== "streaming"),
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "Sorry, something went wrong. Please try again.",
              citations: [],
              created_at: new Date().toISOString(),
            },
          ])
        },
      },
      sessionId,
      initialFilters
    )

    return () => abort()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function startNewChat() {
    setSessionId(undefined)
    setMessages([])
    setCitations([])
    setInput("")
  }

  return (
    <div className="flex h-full gap-4 p-4">
      <ChatHistorySidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onSelect={setSessionId}
        onNewChat={startNewChat}
      />

      <div className="flex flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex-1 overflow-y-auto rounded-xl border bg-card p-4">
          <div className="space-y-6">
            {messages.length === 0 && !isStreaming && (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-8">
                <div className="text-center">
                  <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
                    <span className="text-xl">🧠</span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">Brain Talk</h1>
                  <p className="mt-1 text-sm text-zinc-400">Ask anything about your knowledge base</p>
                </div>
                <SuggestedQuestions
                  onSelect={(q) => {
                    setInput(q)
                  }}
                />
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex w-full",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {message.id === "streaming" ? (
                    <StreamingMessage content={message.content} />
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}

                  {message.citations && message.citations.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.citations.map((citation) => (
                        <SourceCitationCard key={citation.id} citation={citation} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your knowledge base..."
              className="min-h-[56px] flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="shrink-0"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {citations.length > 0 && (
        <div className="hidden w-80 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 lg:flex">
          <h3 className="text-sm font-semibold">Sources</h3>
          <ScrollArea className="flex-1">
            <div className="space-y-3">
              {citations.map((citation) => (
                <SourceCitationCard key={citation.id} citation={citation} compact />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
