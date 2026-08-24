import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "@prisma/client"
import path from "node:path"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const resolveSqliteUrl = () => {
  const configured = process.env.DATABASE_URL ?? "file:./dev.db"
  if (!configured.startsWith("file:")) return configured

  const relativePath = configured.slice("file:".length)
  if (path.isAbsolute(relativePath)) return configured

  return `file:${path.resolve(process.cwd(), relativePath)}`
}

const createPrismaClient = () => {
  const adapter = new PrismaLibSql({
    url: resolveSqliteUrl(),
  })
  return new PrismaClient({ adapter })
}

const hasEspnCredentialDelegate = (client: PrismaClient) => {
  // Important: read getters with the client as receiver, not a Proxy.
  const delegate = Reflect.get(client, "espnCredential", client) as
    | { findUnique?: unknown }
    | undefined

  return typeof delegate?.findUnique === "function"
}

const resolveClient = () => {
  const cached = globalForPrisma.prisma
  if (cached && hasEspnCredentialDelegate(cached)) {
    return cached
  }

  const created = createPrismaClient()
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = created
  }
  return created
}

// Lazy access so a stale pre-migration Prisma singleton can be replaced.
// Prisma model delegates are getters — always Reflect.get with the real client
// as receiver, otherwise espnCredential becomes undefined.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = resolveClient()
    const value = Reflect.get(client, property, client)
    return typeof value === "function" ? value.bind(client) : value
  },
})
