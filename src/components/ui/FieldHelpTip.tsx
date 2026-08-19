"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"

type FieldHelpTipProps = {
  label: string
  children: ReactNode
}

export const FieldHelpTip = ({ label, children }: FieldHelpTipProps) => {
  const tipId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      ref={rootRef}
    >
      <button
        aria-controls={tipId}
        aria-expanded={open}
        aria-label={`How to find ${label}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-hairline)] bg-white text-[0.7rem] font-semibold text-[var(--color-mute)] transition-colors hover:border-[var(--color-ink)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) {
            setOpen(false)
          }
        }}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        type="button"
      >
        ?
      </button>
      {open ? (
        <span
          className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-[min(18.5rem,calc(100vw-3rem))] rounded-xl border border-[var(--color-hairline)] bg-white p-3 text-left text-[0.75rem] leading-5 font-normal text-[var(--color-ink)] shadow-sm"
          id={tipId}
          role="tooltip"
        >
          {children}
        </span>
      ) : null}
    </span>
  )
}
