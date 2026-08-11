"use client"

type ConflictModalProps = {
  isResolving: boolean
  onResolve: (resolution: "apply_espn" | "keep_local") => void
}

export const ConflictModal = ({
  isResolving,
  onResolve,
}: ConflictModalProps) => (
  <div
    aria-labelledby="conflict-modal-title"
    aria-modal="true"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6"
    role="dialog"
  >
    <div className="w-full max-w-lg rounded-[2rem] bg-[var(--color-canvas)] p-7 shadow-2xl">
      <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
        Refresh conflict
      </p>
      <h2 className="mt-2 text-3xl font-semibold" id="conflict-modal-title">
        Your lineup has local edits
      </h2>
      <p className="mt-3 leading-6 text-[var(--color-mute)]">
        ESPN has different roster assignments. Choose whether to replace your
        local lineup or keep it on top of the refreshed league.
      </p>
      <div className="mt-7 flex flex-wrap justify-end gap-3">
        <button
          className="rounded-full border border-[var(--color-hairline)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-soft-cloud)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isResolving}
          onClick={() => onResolve("keep_local")}
          type="button"
        >
          Keep local edits
        </button>
        <button
          className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isResolving}
          onClick={() => onResolve("apply_espn")}
          type="button"
        >
          Apply ESPN lineup
        </button>
      </div>
    </div>
  </div>
)
