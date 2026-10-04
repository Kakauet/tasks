"use client"

import { useEffect, useState } from "react"
import { readStorage, writeStorage } from "@/lib/storage"
import { parseColumnSorts, type ColumnSorts } from "@/lib/tasks/view"

const STORAGE_KEY = "taskmaster-column-sorts"

export function useColumnSorts() {
  const [sorts, setSorts] = useState<ColumnSorts>(() => parseColumnSorts(null))
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setSorts(parseColumnSorts(readStorage(STORAGE_KEY)))
    setLoaded(true)
  }, [])

  useEffect(() => {
    // Do not overwrite saved choices with the server-rendered defaults.
    if (loaded) writeStorage(STORAGE_KEY, JSON.stringify(sorts))
  }, [loaded, sorts])

  return [sorts, setSorts] as const
}
