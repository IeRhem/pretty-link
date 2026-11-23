import { Suspense } from "react"
import { StudioWorkspace } from "@/components/studio/studio-workspace"
import { Skeleton } from "@/components/ui/skeleton"

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh gap-4 bg-background p-2.5 sm:p-3 lg:p-4">
          <Skeleton className="hidden h-full w-[320px] rounded-2xl lg:block xl:w-[332px]" />
          <Skeleton className="h-full flex-1 rounded-2xl" />
        </div>
      }
    >
      <StudioWorkspace />
    </Suspense>
  )
}
