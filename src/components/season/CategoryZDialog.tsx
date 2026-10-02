"use client"

import { useEffect, useRef } from "react"
import type { CategoryId } from "@/lib/domain/types"
import {
  CategoryZScale,
  type CategoryZDot,
} from "@/components/season/CategoryZScale"

type CategoryZDialogProps = {
  categoryId: CategoryId
  label: string
  dots: CategoryZDot[]
  onClose: () => void
}

export const CategoryZDialog = ({
  categoryId,
  label,
  dots,
  onClose,
}: CategoryZDialogProps) => {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== "Tab" || !panelRef.current) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLButtonElement>("button"),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const activeInsidePanel =
        active instanceof Node && panelRef.current.contains(active)

      if (
        event.shiftKey &&
        (active === first || !activeInsidePanel)
      ) {
        event.preventDefault()
        last?.focus()
      } else if (
        !event.shiftKey &&
        (active === last || !activeInsidePanel)
      ) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
    // Mount-only: onClose is read through onCloseRef so a parent render cannot refocus Close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      aria-labelledby="category-z-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current()
      }}
      role="dialog"
    >
      <div
        className="w-full max-w-3xl rounded-[2rem] bg-[var(--color-canvas)] p-7 shadow-2xl"
        ref={panelRef}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.16em] text-[var(--color-mute)] uppercase">
              League z
            </p>
            <h2 className="mt-1 text-3xl font-semibold" id="category-z-title">
              {label}
            </h2>
          </div>
          <button
            className="rounded-full border border-[var(--color-hairline)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-soft-cloud)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
            onClick={() => onCloseRef.current()}
            ref={closeRef}
            type="button"
          >
            Close
          </button>
        </div>
        <CategoryZScale categoryId={categoryId} dots={dots} mode="expanded" />
      </div>
    </div>
  )
}
