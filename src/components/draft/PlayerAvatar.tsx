"use client"

import { useState } from "react"
import type { Player } from "@/lib/domain/types"
import { playerInitials, resolvePlayerImageUrl } from "@/lib/players/playerIdentity"

type PlayerAvatarProps = {
  player: Player
  size?: "sm" | "md"
  nameShown?: boolean
}

const sizeClasses = {
  sm: "h-6 w-6 text-[0.625rem]",
  md: "h-8 w-8 text-xs",
} as const

export const PlayerAvatar = ({
  player,
  size = "sm",
  nameShown = true,
}: PlayerAvatarProps) => {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = resolvePlayerImageUrl(player)
  const initials = playerInitials(player.name)
  const alt = nameShown ? "" : player.name
  const sizeClass = sizeClasses[size]

  if (!imageUrl || imageFailed) {
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
