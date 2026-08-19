import { updateConnectSessionStatus } from "@/lib/espn/connectSession"

export type ConnectWorker = {
  start(sessionId: string, clerkUserId: string): void
}

let testWorker: ConnectWorker | null = null

export const setConnectWorkerForTests = (worker: ConnectWorker | null): void => {
  testWorker = worker
}

const liveWorker: ConnectWorker = {
  start: (sessionId, clerkUserId) => {
    void (async () => {
      let runLiveConnectWorker: (
        sessionId: string,
        clerkUserId: string,
      ) => Promise<void>

      try {
        const liveWorkerModule =
          await import("@/lib/espn/connectWorkerLive")
        runLiveConnectWorker = liveWorkerModule.runLiveConnectWorker
      } catch {
        await updateConnectSessionStatus(
          sessionId,
          "failed",
          "CONNECT_WORKER",
        )
        return
      }

      await runLiveConnectWorker(sessionId, clerkUserId)
    })()
  },
}

const disabledWorker: ConnectWorker = {
  start: (sessionId) => {
    void updateConnectSessionStatus(
      sessionId,
      "failed",
      "CONNECT_LIVE_DISABLED",
    )
  },
}

export const getConnectWorker = (): ConnectWorker => {
  if (testWorker) return testWorker
  if (process.env.ESPN_CONNECT_LIVE === "true") return liveWorker
  return disabledWorker
}
