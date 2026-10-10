import { MatchupWorkspace } from "@/components/matchup/MatchupWorkspace"

type MatchupWorkspacePageProps = {
  params: Promise<{ id: string }>
}

export default async function MatchupWorkspacePage({
  params,
}: MatchupWorkspacePageProps) {
  const { id } = await params

  return <MatchupWorkspace leagueId={id} />
}
