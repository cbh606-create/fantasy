"use client"

type WaiverAssumeModalProps = {
  addPlayerName: string
  isClaiming: boolean
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
  youWaiverRank: number
}

export const WaiverAssumeModal = ({
  addPlayerName,
  isClaiming,
  isOpen,
  onCancel,
  onConfirm,
  youWaiverRank,
}: WaiverAssumeModalProps) => {
  if (!isOpen) return null

  return (
    <div
      aria-labelledby="waiver-assume-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-[2rem] bg-[var(--color-canvas)] p-7 shadow-2xl">
        <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
          Waiver claim
        </p>
        <h2 className="mt-2 text-3xl font-semibold" id="waiver-assume-modal-title">
          Assume successful claim?
        </h2>
        <p className="mt-3 leading-6 text-[var(--color-mute)]">
          {addPlayerName} is on waivers and you are rank #{youWaiverRank}. This
          claim is applied locally as if you won the waiver. ESPN is not updated.
        </p>
        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-full border border-[var(--color-hairline)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-soft-cloud)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isClaiming}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isClaiming}
            onClick={onConfirm}
            type="button"
          >
            {isClaiming ? "Claiming…" : "Confirm claim"}
          </button>
        </div>
      </div>
    </div>
  )
}
