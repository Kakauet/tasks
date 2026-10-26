// Completed tasks fold into a single line, except the ones the user has just
// completed: those stay open (with «Reabrir» at hand) until they have been seen
// and then left the screen, so a mistaken click never makes a card jump away.
const keptOpen = new Set<string>()

export const keepOpen = (taskId: string) => { keptOpen.add(taskId) }
export const isKeptOpen = (taskId: string) => keptOpen.has(taskId)
export const releaseOpen = (taskId: string) => { keptOpen.delete(taskId) }
