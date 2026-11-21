import { Suspense } from "react"
import { StudioWorkspace } from "@/components/studio/studio-workspace"
import { Skeleton } from "@/components/ui/skeleton"

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen gap-4 bg-background p-4">
          <Skeleton className="hidden h-full w-[320px] rounded-2xl md:block" />
          <Skeleton className="h-150 flex-1 rounded-2xl md:h-full" />
        </div>
      }
    >
      <StudioWorkspace />
    </Suspense>
  )
}
