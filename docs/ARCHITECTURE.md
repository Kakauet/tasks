# Arquitectura de TaskMaster

La aplicación mantiene un único estado de tareas, eventos y etiquetas. `context/task-context.tsx` compone los hooks y conserva la API de `useTaskContext()` y sus tipos públicos. Los componentes no acceden directamente a Supabase ni a la persistencia de ese estado.

## Responsabilidades

- `hooks/use-task-history.ts`: adapta el historial a React, registra actividad y atiende los atajos de deshacer/rehacer. La referencia al historial se actualiza antes de solicitar el render: varias operaciones en el mismo manejador leen el resultado de la anterior.
- `lib/tasks/history.ts`: transiciones puras de historial, límite de 50 entradas y descarte de redo al registrar cambios. Un cambio que conserva las tres colecciones por referencia no genera entrada ni elimina redo. Carga y aplicación remota sustituyen el estado y vacían el historial; importar sigue siendo una operación reversible.
- `hooks/use-task-operations.ts`: comandos y consultas de tareas, eventos, etiquetas y pasos. Los comandos reciben el escritor del historial y no una captura del estado del último render. Se conservan sus callbacks y dependencias para evitar invalidar consumidores en cada render. La normalización, recurrencia y orden siguen en `lib/tasks/model.ts`, `recurrence.ts` y `order.ts`; no se duplican.
- `hooks/use-task-sync.ts`: ciclo de carga y guardado local, disponibilidad de cuenta, debounce, exclusión de rondas simultáneas, reintentos, eventos de reconexión, polling y Realtime. Solo necesita leer el estado actual y poder sustituirlo; no manipula las pilas de undo/redo.
- `lib/sync/round.ts`: una ronda de lectura, merge y escritura condicional. Recibe efectos explícitos para aplicar estado, guardar la base y preservar datos de otra cuenta. No depende de React, del DOM ni de timers, lo que permite probar carreras de escritura sin una conexión real.
- `lib/sync/merge.ts`: merge a tres bandas entre la base común, el estado local y el remoto.
- `lib/tasks/storage.ts` y `lib/data/`: IndexedDB, migración y respaldo en localStorage, compresión, importación/exportación, recuperación y actividad. Se conservan formatos, claves, esquema y serialización.

## Invariantes de sincronización y datos

La escritura sobre una fila existente compara `updated_at` con la versión leída. Cero filas actualizadas o un conflicto de inserción (`23505`) obligan a leer y combinar de nuevo; no se avanza la base tras una escritura rechazada. La siguiente versión supera a la anterior incluso si el reloj local va atrasado.

El merge lee el estado local después de la espera de red. Si hay una edición durante la subida, se guarda el estado actual junto con la base que sí se confirmó, y la edición queda pendiente para otra ronda. La base y el estado siguen guardándose juntos por la cola de persistencia existente.

Una copia remota inválida se rechaza. Al cambiar a otra cuenta con datos locales, la recuperación debe completarse antes de sustituirlos. Las importaciones siguen validándose completas antes de modificar el historial. No se modifican autenticación, sesiones, esquema Supabase, JSONB, RLS ni formatos persistidos.

## Verificación y límites

`npm test` usa Node, el compilador TypeScript existente y fake-indexeddb. Las pruebas previas protegen formatos, migración, recuperación, orden, recurrencias y merge. `tests/sync-round.cjs` ejecuta la ronda real con una frontera Supabase simulada: actualizaciones e inserciones concurrentes, reconexión, ediciones durante I/O, cambios de cuenta y datos inválidos. `tests/task-operations.cjs` usa el renderer de servidor de React para obtener los comandos y ejecutarlos contra las transiciones puras del historial: no necesita navegador ni un framework nuevo.

`tests/sync-lifecycle.cjs` monta el hook real con `react-test-renderer` y un reloj determinista para verificar efectos, reintentos, reconexión y cambios de cuenta. Cada ciclo de cuenta tiene una generación: la limpieza invalida las peticiones anteriores, incluso al volver al mismo usuario, y una cuenta pendiente arranca cuando la ronda anterior libera su bloqueo.

Las pruebas locales no verifican políticas RLS desplegadas, entrega real de Realtime ni OAuth. CI conserva las comprobaciones de tipos, lint, pruebas y build, sin necesitar credenciales ni un proyecto externo. Las comprobaciones opcionales de navegador están descritas en [DEVELOPMENT.md](DEVELOPMENT.md).

Se mantiene un único contexto y un hook de operaciones cohesivo: dividirlo por entidad o introducir repositorios genéricos añadiría coordinación sin una necesidad demostrada. Los cambios de persistencia o de resolución de conflictos requieren una revisión específica de integridad de datos.
