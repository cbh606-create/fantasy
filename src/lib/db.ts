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

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
}
