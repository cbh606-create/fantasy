import { Banner } from "@/components/ui/Banner"
import { Button } from "@/components/ui/Button"

type SyncBarProps = {
  error: string
  isManualMode: boolean
  isSyncing: boolean
  onContinueManually: () => void
  onSync: () => void
}

export const SyncBar = ({
  error,
  isManualMode,
  isSyncing,
  onContinueManually,
  onSync,
}: SyncBarProps) => (
  <div className="mb-6 space-y-3">
    <div className="flex flex-col gap-4 rounded-[2rem] bg-[var(--color-soft-cloud)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
          Board source
        </p>
        <p className="mt-1 font-medium">
          {isManualMode ? "Manual mode" : "ESPN synced"}
        </p>
      </div>
      <Button
        aria-label="Sync ESPN board"
        disabled={isManualMode || isSyncing}
        onClick={onSync}
      >
        {isSyncing ? "Syncing…" : "Sync"}
      </Button>
    </div>
    {error ? (
      <Banner
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        tone="danger"
      >
        <span>{error}</span>
        <button
          className="w-fit rounded-full bg-white px-4 py-2 text-sm font-medium text-[var(--color-sale)]"
          onClick={onContinueManually}
          type="button"
        >
          Continue manually
        </button>
      </Banner>
    ) : null}
  </div>
)
