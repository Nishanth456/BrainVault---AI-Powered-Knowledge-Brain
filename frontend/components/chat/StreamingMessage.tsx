"use client"

import { MarkdownRenderer } from "./MarkdownRenderer"

interface StreamingMessageProps {
  content: string
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return (
    <div className="relative group">
      <MarkdownRenderer content={content} />
      <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-current align-middle absolute bottom-1 right-[-8px]" />
    </div>
  )
}
