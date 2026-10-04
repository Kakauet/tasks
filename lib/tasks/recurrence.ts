import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO } from "date-fns"
import { v4 as uuidv4 } from "uuid"
import { normalizeEventRecord } from "./model"
import type { Event, EventRecurrence } from "./types"

/** Upper bound on generated occurrences, enough for a daily event during a whole year. */
export const MAX_OCCURRENCES = 400

export const generateRecurringEvents =(baseEvent: Event, recurrence: EventRecurrence): Event[] => {
  if (recurrence.type === "none") {
    return []
  }

  const recurringEvents: Event[] = []
  const startDate = parseISO(baseEvent.date)
  let currentDate = startDate
  let occurrenceCount = 0
  // Without an explicit count, repeat until the end date (one year ahead when it never ends).
  const maxOccurrences = Math.min(recurrence.occurrences || MAX_OCCURRENCES, MAX_OCCURRENCES)
  const endDate = recurrence.endDate
    ? parseISO(recurrence.endDate)
    : recurrence.occurrences ? null : addYears(startDate, 1)

  // Calcular la duración del evento en días si es un evento de varios días
  let eventDuration = 0
  if (baseEvent.isMultiDay && baseEvent.endDate) {
    const eventEndDate = parseISO(baseEvent.endDate)
    eventDuration = differenceInCalendarDays(eventEndDate, startDate)
  }

  // Generar eventos recurrentes hasta alcanzar el límite de ocurrencias o la fecha de finalización
  while (occurrenceCount < maxOccurrences && (!endDate || currentDate <= endDate)) {
    // Saltar la primera ocurrencia ya que es el evento base
    if (occurrenceCount > 0) {
      const eventDate = format(currentDate, "yyyy-MM-dd")

      // Calcular la fecha de finalización para eventos de varios días
      let eventEndDate: string | undefined = undefined
      if (baseEvent.isMultiDay && eventDuration > 0) {
        eventEndDate = format(addDays(currentDate, eventDuration), "yyyy-MM-dd")
      }

      const newEvent: Event = {
        ...baseEvent,
        id: uuidv4(),
        date: eventDate,
        endDate: eventEndDate,
        recurrence: undefined,
        parentEventId: baseEvent.id, // Referencia al evento padre
      }
      recurringEvents.push(normalizeEventRecord(newEvent))
    }

    // Calcular la siguiente fecha según el tipo de recurrencia
    switch (recurrence.type) {
      case "daily":
        currentDate = addDays(currentDate, recurrence.interval)
        break
      case "weekly":
        currentDate = addWeeks(currentDate, recurrence.interval)
        break
      case "monthly":
        currentDate = addMonths(startDate, (occurrenceCount + 1) * recurrence.interval)
        break
      case "yearly":
        currentDate = addYears(startDate, (occurrenceCount + 1) * recurrence.interval)
        break
    }

    occurrenceCount++
  }

  return recurringEvents
}

