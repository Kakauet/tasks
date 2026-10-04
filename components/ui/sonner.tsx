"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

type AppToasterProps = Omit<ToasterProps, "theme">

export function Toaster(props: AppToasterProps) {
  const { theme = "system" } = useTheme()

  return <Sonner theme={theme as ToasterProps["theme"]} {...props} />
}
