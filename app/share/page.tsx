import { Suspense } from "react"
import { ShareView } from "@/components/studio/share-view"
import { Skeleton } from "@/components/ui/skeleton"

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <Skeleton className="size-[460px] rounded-3xl" />
        </div>
      }
    >
      <ShareView />
    </Suspense>
  )
}
