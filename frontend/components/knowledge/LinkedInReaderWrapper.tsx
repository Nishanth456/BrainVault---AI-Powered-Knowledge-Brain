"use client"
import dynamic from "next/dynamic"

const LinkedInReaderDynamic = dynamic(
  () => import("./LinkedInReader").then(mod => mod.LinkedInReader),
  { ssr: false }
)

export function LinkedInReaderWrapper(props: any) {
  return <LinkedInReaderDynamic {...props} />
}
