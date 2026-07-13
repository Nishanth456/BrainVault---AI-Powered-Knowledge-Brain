"use client"

interface StreamingMessageProps {
  content: string
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return (
    <div className="whitespace-pre-wrap">
      {content}
      <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />
    </div>
  )
}
