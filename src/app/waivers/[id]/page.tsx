import { WaiversWorkspace } from "@/components/waivers/WaiversWorkspace"

type WaiversWorkspacePageProps = {
  params: Promise<{ id: string }>
}

export default async function WaiversWorkspacePage({
  params,
}: WaiversWorkspacePageProps) {
  const { id } = await params

  return <WaiversWorkspace leagueId={id} />
}
