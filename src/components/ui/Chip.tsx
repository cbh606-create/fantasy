import type { ButtonHTMLAttributes } from "react"

type ChipVariant = "default" | "active"

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ChipVariant
}

const chipVariantClasses: Record<ChipVariant, string> = {
  default: "bg-[#f5f5f5] text-[#111111]",
  active: "bg-[#111111] text-white",
}

export const Chip = ({
  className = "",
  type = "button",
  variant = "default",
  ...props
}: ChipProps) => (
  <button
    aria-pressed={variant === "active"}
    className={`h-9 rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${chipVariantClasses[variant]} ${className}`}
    type={type}
    {...props}
  />
)
