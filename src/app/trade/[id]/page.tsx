import { TradeWorkspace } from "@/components/trade/TradeWorkspace"

type TradeWorkspacePageProps = {
  params: Promise<{ id: string }>
}

export default async function TradeWorkspacePage({
  params,
}: TradeWorkspacePageProps) {
  const { id } = await params

  return <TradeWorkspace leagueId={id} />
}
