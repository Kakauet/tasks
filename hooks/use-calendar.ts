"use client"

import type { Event } from "@/context/task-context"
import { writeStorage } from "@/lib/storage"
import {
addDays,
addMonths,
endOfMonth,
endOfWeek,
getDay,
isSameDay,
parseISO,
startOfMonth,
startOfWeek,
subMonths,
} from "date-fns"
import { es } from "date-fns/locale"
import { useCallback, useEffect, useMemo, useState } from "react"

const CALENDAR_STATE_STORAGE_KEY = "taskmaster-calendar-state"
const STORED_DATE_TTL_MS = 2 * 60 * 60 * 1000

type CalendarViewMode = "month" | "week"

type StoredCalendarState = {
  savedAt?: number
  currentDate?: string
  selectedDate?: string | null
  view?: CalendarViewMode
}

function parseStoredDate(value?: string | null): Date | null {
  if (!value) return null

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

function readStoredCalendarState(): StoredCalendarState | null {
  if (typeof window === "undefined") return null

  try {
    const rawValue = window.localStorage.getItem(CALENDAR_STATE_STORAGE_KEY)
    if (!rawValue) return null

    const state = JSON.parse(rawValue) as StoredCalendarState
    // A reload keeps the visited date; opening the app later starts again on today.
    const isRecent = typeof state.savedAt === "number" && Date.now() - state.savedAt < STORED_DATE_TTL_MS
    return isRecent ? state : { view: state.view }
  } catch {
    return null
  }
}

/**
 * Hook personalizado para manejar la logica del calendario
 */
export function useCalendar(getEventsForDate: (date: Date) => Event[]) {
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const storedState = readStoredCalendarState()
    const storedSelectedDate = parseStoredDate(storedState?.selectedDate)

    return parseStoredDate(storedState?.currentDate) ?? storedSelectedDate ?? new Date()
  })
  const [selectedDate, setSelectedDateState] = useState<Date | null>(() => {
    const storedState = readStoredCalendarState()
    return parseStoredDate(storedState?.selectedDate) ?? new Date()
  })
  const [view, setView] = useState<CalendarViewMode>(() => {
    const storedState = readStoredCalendarState()
    return storedState?.view === "week" ? "week" : "month"
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    writeStorage(
      CALENDAR_STATE_STORAGE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        currentDate: currentDate.toISOString(),
        selectedDate: selectedDate ? selectedDate.toISOString() : null,
        view,
      } satisfies StoredCalendarState),
    )
  }, [currentDate, selectedDate, view])

  const setSelectedDate = useCallback((date: Date | null) => {
    setSelectedDateState(date)

    if (date) {
      setCurrentDate(date)
    }
  }, [])

  // Funciones de navegacion
  const goToToday = useCallback(() => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDateState(today)
  }, [])

  const prevMonth = useCallback(() => {
    setCurrentDate((prev) => subMonths(prev, 1))
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentDate((prev) => addMonths(prev, 1))
  }, [])

  const prevWeek = useCallback(() => {
    setCurrentDate((prev) => addDays(prev, -7))
  }, [])

  const nextWeek = useCallback(() => {
    setCurrentDate((prev) => addDays(prev, 7))
  }, [])

  // Calculo de dias del calendario
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart, { locale: es, weekStartsOn: 1 })
    const endDate = endOfWeek(monthEnd, { locale: es, weekStartsOn: 1 })

    const days = []
    let day = startDate
    while (day <= endDate) {
      days.push(day)
      day = addDays(day, 1)
    }
    return days
  }, [currentDate])

  // Calculo de dias de la semana
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { locale: es, weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [currentDate])

  // Funciones de utilidad
  const isSunday = useCallback((date: Date) => getDay(date) === 0, [])

  // Funciones para eventos de varios dias
  const getMultiDayPosition = useCallback((event: Event, day: Date): "start" | "middle" | "end" | null => {
    if (!event.isMultiDay || !event.endDate) return null

    const eventStartDate = parseISO(event.date)
    const eventEndDate = parseISO(event.endDate)

    if (isSameDay(day, eventStartDate)) return "start"
    if (isSameDay(day, eventEndDate)) return "end"
    return "middle"
  }, [])

  // Datos para la fecha seleccionada
  const selectedDateEvents = useMemo(
    () => (selectedDate ? getEventsForDate(selectedDate) : []),
    [selectedDate, getEventsForDate],
  )

  return {
    currentDate,
    selectedDate,
    setSelectedDate,
    view,
    setView,
    calendarDays,
    weekDays,
    goToToday,
    prevMonth,
    nextMonth,
    prevWeek,
    nextWeek,
    isSunday,
    getMultiDayPosition,
    selectedDateEvents,
  }
}
