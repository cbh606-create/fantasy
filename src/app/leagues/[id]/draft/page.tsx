import { DraftWorkspace } from "@/components/draft/DraftWorkspace"

type DraftPageProps = {
  params: Promise<{ id: string }>
}

export default async function DraftPage({ params }: DraftPageProps) {
  const { id } = await params

  return <DraftWorkspace leagueId={id} />
}
