"use client"

import { useState } from "react"
import { playerInitials, resolvePlayerImageUrl } from "@/lib/players/playerIdentity"

type PlayerAvatarSource = {
  name: string
  imageUrl?: string
  espnId?: string
  id?: string
}

type PlayerAvatarProps = {
  player: PlayerAvatarSource
  size?: "xs" | "sm" | "md"
  nameShown?: boolean
  fallback?: "initials" | "none"
}

const sizeClasses = {
  xs: "h-5 w-5 text-[0.5rem]",
  sm: "h-6 w-6 text-[0.625rem]",
  md: "h-8 w-8 text-xs",
} as const

export const PlayerAvatar = ({
  player,
  size = "sm",
  nameShown = true,
  fallback = "initials",
}: PlayerAvatarProps) => {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolvePlayerImageUrl(player)
  const initials = playerInitials(player.name)
  const alt = nameShown ? "" : player.name
  const sizeClass = sizeClasses[size]

  if (!imageUrl || imageFailed) {
    if (fallback === "none") return null
    return (
      <span
        aria-hidden={nameShown ? true : undefined}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-soft-cloud font-medium text-ink/70 ${sizeClass}`}
        title={player.name}
      >
        {initials}
      </span>
    )
  }

  const handleImageError = () => {
    setImageFailed(true)
  }

  return (
    <img
      alt={alt}
      className={`inline-block shrink-0 rounded-full object-cover ${sizeClass}`}
      onError={handleImageError}
      src={imageUrl}
    />
  )
}
