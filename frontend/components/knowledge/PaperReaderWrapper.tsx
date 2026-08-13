"use client"
import dynamic from "next/dynamic"

const PaperReaderDynamic = dynamic(
  () => import("./PaperReader").then(mod => mod.PaperReader),
  { ssr: false }
)

export function PaperReaderWrapper(props: any) {
  return <PaperReaderDynamic {...props} />
}
