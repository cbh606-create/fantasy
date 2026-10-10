import { SeasonRosterWorkspace } from "@/components/season/SeasonRosterWorkspace"

type RosterWorkspacePageProps = {
  params: Promise<{ id: string }>
}

export default async function RosterWorkspacePage({
  params,
}: RosterWorkspacePageProps) {
  const { id } = await params

  return <SeasonRosterWorkspace leagueId={id} />
}
