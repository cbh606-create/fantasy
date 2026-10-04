import { Suspense } from "react"
import { RouteSegmentLoading } from "@/components/season/SeasonToolShell"
import { WaiversWorkspace } from "@/components/waivers/WaiversWorkspace"

type WaiversWorkspacePageProps = {
  params: Promise<{ id: string }>
}

export default async function WaiversWorkspacePage({
  params,
}: WaiversWorkspacePageProps) {
  const { id } = await params

  return (
    <Suspense fallback={<RouteSegmentLoading label="Loading waivers…" />}>
      <WaiversWorkspace leagueId={id} />
    </Suspense>
  )
}
