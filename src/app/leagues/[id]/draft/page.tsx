import { DraftWorkspace } from "@/components/draft/DraftWorkspace"

type DraftPageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

const parseInitialMode = (tab?: string) => {
  if (tab === "mock" || tab === "live") return tab
  return "mock"
}

export default async function DraftPage({
  params,
  searchParams,
}: DraftPageProps) {
  const { id } = await params
  const { tab } = await searchParams

  return (
    <DraftWorkspace initialMode={parseInitialMode(tab)} leagueId={id} />
  )
}
