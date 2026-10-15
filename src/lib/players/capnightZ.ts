import { ALL_CATEGORY_IDS } from "@/lib/domain/categories"
import type { CategoryId } from "@/lib/domain/types"
import table from "../../../data/players/capnight-bm-z-2026-27.json"

type StoredZ = {
  name: string
  value: number
  z: Record<CategoryId, number>
}

const rows = table as Record<string, StoredZ>

const zeroCategories = (): Record<CategoryId, number> =>
  Object.fromEntries(ALL_CATEGORY_IDS.map((categoryId) => [categoryId, 0])) as Record<CategoryId, number>

const suffixPattern = / (jr|sr|ii|iii|iv)$/

export const normalizePlayerName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()

export const capnightPlayerZ = (
  name: string,
): { value: number; z: Record<CategoryId, number> } => {
  const key = normalizePlayerName(name)
  const row = rows[key] ?? rows[key.replace(suffixPattern, "")]
  if (!row) return { value: 0, z: zeroCategories() }

  return { value: row.value, z: row.z }
}
