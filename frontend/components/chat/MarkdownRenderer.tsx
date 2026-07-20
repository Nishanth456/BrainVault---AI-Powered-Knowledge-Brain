"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface MarkdownRendererProps {
  content: string
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ ...props }) => <p className="mb-3 last:mb-0" {...props} />,
        a: ({ ...props }) => (
          <a className="text-violet-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
        ),
        ul: ({ ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1" {...props} />,
        ol: ({ ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1" {...props} />,
        li: ({ ...props }) => <li className="" {...props} />,
        h1: ({ ...props }) => <h1 className="text-xl font-bold mb-3 mt-5" {...props} />,
        h2: ({ ...props }) => <h2 className="text-lg font-bold mb-3 mt-4" {...props} />,
        h3: ({ ...props }) => <h3 className="text-base font-bold mb-2 mt-4" {...props} />,
        strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
        code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean, node?: unknown }) => {
          const match = /language-(\w+)/.exec(className || '')
          const inline = !match && !String(children).includes('\n')
          
          if (inline) {
            return (
              <code className="bg-black/20 dark:bg-white/10 rounded px-1.5 py-0.5 text-sm font-mono" {...props}>
                {children}
              </code>
            )
          }
          return (
            <div className="my-4 rounded-lg bg-black/20 dark:bg-white/5 border border-white/10 overflow-hidden">
              <div className="flex items-center px-4 py-2 bg-black/40 dark:bg-white/5 text-xs text-zinc-400 border-b border-white/5">
                {match ? match[1] : 'code'}
              </div>
              <div className="p-4 overflow-x-auto">
                <code className="text-sm font-mono" {...props}>
                  {children}
                </code>
              </div>
            </div>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
