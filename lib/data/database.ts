let connection: Promise<IDBDatabase> | undefined

export function openLocalDatabase(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("taskmaster-local-data", 2)
    request.onupgradeneeded = () => {
      for (const name of ["activity", "daily", "recovery", "state"]) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" })
      }
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("Cierra las otras pestañas de la aplicación e inténtalo de nuevo."))
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined }
      resolve(request.result)
    }
  }).catch(error => { connection = undefined; throw error })
  return connection
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error("La operación local se canceló."))
  })
  // Request failures can be observed before the transaction is awaited.
  void done.catch(() => {})
  return done
}

export async function readAll<T>(name: string): Promise<T[]> {
  const db = await openLocalDatabase()
  return idbRequest(db.transaction(name).objectStore(name).getAll())
}
