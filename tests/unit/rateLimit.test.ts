import { describe, expect, it } from "vitest"
import { rateLimit } from "@/lib/rateLimit"

describe("rateLimit", () => {
  it("rejects the third call when the limit is two", () => {
    const key = `test-${crypto.randomUUID()}`

    expect(rateLimit(key, 2, 1_000)).toEqual({ ok: true })
    expect(rateLimit(key, 2, 1_000)).toEqual({ ok: true })
    expect(rateLimit(key, 2, 1_000).ok).toBe(false)
  })
})
