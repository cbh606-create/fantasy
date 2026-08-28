import { ClerkProvider } from "@clerk/nextjs"
import type { Metadata } from "next"
import { Barlow, Bebas_Neue } from "next/font/google"
import { SiteNav } from "@/components/SiteNav"
import { ActiveSeasonLeagueProvider } from "@/components/season/ActiveSeasonLeagueProvider"
import "./globals.css"

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
})

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  weight: "400",
})

export const metadata: Metadata = {
  title: "Week Winner",
  description: "ESPN fantasy basketball draft prep and season roster tools",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${barlow.className} ${barlow.variable} ${bebasNeue.variable} antialiased`}
      >
        <ClerkProvider>
          <ActiveSeasonLeagueProvider>
            <div className="min-h-screen">
              <SiteNav />
              {children}
            </div>
          </ActiveSeasonLeagueProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
