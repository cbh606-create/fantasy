import type { InputHTMLAttributes } from "react"

type SearchPillProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">

export const SearchPill = ({
  className = "",
  ...props
}: SearchPillProps) => (
  <input
    className={`h-12 w-full rounded-full bg-[#f5f5f5] px-5 text-[#111111] outline-none placeholder:text-[#707072] focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2 ${className}`}
    type="search"
    {...props}
  />
)
