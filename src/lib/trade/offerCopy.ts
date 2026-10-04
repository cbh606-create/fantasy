import type { CategoryId } from "@/lib/domain/types"

export const formatTotal = (categoryId: CategoryId, total: number) =>
  categoryId === "FG_PCT" || categoryId === "FT_PCT"
    ? `${(total * 100).toFixed(1)}%`
    : total.toFixed(1)

export const formatValueLine = ({
  giveLarger,
  valueGap,
  overpayRatio,
}: {
  giveLarger: boolean
  valueGap?: number
  overpayRatio?: number
}) => {
  if (overpayRatio !== undefined) {
    return `The two-player side is ${overpayRatio.toFixed(2)}× the one-player side`
  }

  const gapPercent = Math.round((valueGap ?? 0) * 100)

  if (gapPercent === 0) {
    return "Packages are even"
  }

  return giveLarger
    ? `Your package is larger by ${gapPercent}%`
    : `Their package is larger by ${gapPercent}%`
}
