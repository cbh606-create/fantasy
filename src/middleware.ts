import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server"

const isProtectedRoute = createRouteMatcher(["/leagues(.*)", "/api/(.*)"])

const protectedMiddleware = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) await auth.protect()
})

const isLocalE2ERequest = (request: NextRequest) =>
  process.env.E2E_BYPASS_AUTH === "true" &&
  ["localhost", "127.0.0.1", "::1"].includes(request.nextUrl.hostname)

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (isLocalE2ERequest(request)) return NextResponse.next()

  return protectedMiddleware(request, event)
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
