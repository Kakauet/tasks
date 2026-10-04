import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TaskMaster - Gesti\u00f3n de Tareas",
    short_name: "TaskMaster",
    description: "Aplicaci\u00f3n moderna para gestionar tareas, eventos y proyectos",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "es",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  }
}
