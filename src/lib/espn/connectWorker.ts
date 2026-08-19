export type ConnectWorker = {
  start(sessionId: string, clerkUserId: string): void
}

let testWorker: ConnectWorker | null = null

export const setConnectWorkerForTests = (worker: ConnectWorker | null): void => {
  testWorker = worker
}

const noopWorker: ConnectWorker = {
  start: () => {},
}

export const getConnectWorker = (): ConnectWorker => {
  if (testWorker) return testWorker
  return noopWorker
}
