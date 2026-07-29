import type { HTMLAttributes } from "react"

type BannerTone = "success" | "danger" | "mute"

type BannerProps = HTMLAttributes<HTMLDivElement> & {
  tone?: BannerTone
}

const bannerToneClasses: Record<BannerTone, string> = {
  success: "bg-[#e5f2ec] text-[#007d48]",
  danger: "bg-[#fae6e6] text-[#d30005]",
  mute: "bg-[#f5f5f5] text-[#707072]",
}

export const Banner = ({
  className = "",
  role,
  tone = "mute",
  ...props
}: BannerProps) => (
  <div
    className={`rounded-xl px-4 py-3 text-sm font-medium ${bannerToneClasses[tone]} ${className}`}
    role={role ?? (tone === "danger" ? "alert" : "status")}
    {...props}
  />
)
