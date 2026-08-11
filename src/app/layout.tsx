import { ClerkProvider } from "@clerk/nextjs"
import type { Metadata } from "next"
import { Bebas_Neue, Inter } from "next/font/google"
import { SiteNav } from "@/components/SiteNav"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
})

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-bebas-neue",
  weight: "400",
})

export const metadata: Metadata = {
  title: "Fantasy",
  description: "ESPN fantasy basketball draft prep and season roster tools",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${bebasNeue.variable} antialiased`}>
        <ClerkProvider>
          <div className="min-h-screen">
            <SiteNav />
            {children}
          </div>
        </ClerkProvider>
      </body>
    </html>
  )
}
