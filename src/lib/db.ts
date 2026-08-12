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
  const delegate = (
    client as PrismaClient & {
      espnCredential?: { findUnique?: unknown }
    }
  ).espnCredential

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

// Lazy proxy so a stale pre-migration Prisma singleton is replaced after generate.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = resolveClient()
    const value = Reflect.get(client, property, receiver)
    return typeof value === "function" ? value.bind(client) : value
  },
})
