import { MobileViewport } from "@/components/mobile-viewport"
import { ActivityRecorder } from "@/components/activity-recorder"
import { AppearanceScript } from "@/components/appearance-script"
import { HostingCleanupScript } from "@/components/hosting-cleanup-script"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/context/auth-context"
import type { Metadata, Viewport } from "next"
import type React from "react"
import "./globals.css"

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: "TaskMaster - Gesti\u00f3n de Tareas",
  description: "Aplicaci\u00f3n moderna para gestionar tareas, eventos y proyectos",
  generator: "v0.app",
  applicationName: "TaskMaster",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TaskMaster",
    statusBarStyle: "default",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head><HostingCleanupScript /><AppearanceScript /></head>
      <body>
        <MobileViewport />
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <ActivityRecorder />
            {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
