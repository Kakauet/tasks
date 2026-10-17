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

## Asignaturas

`AppState.subjects` es una colección más, con las mismas reglas que las etiquetas: viaja en el estado, en el historial (deshacer/rehacer), en el merge a tres bandas y en las copias de seguridad. `Task.subjectId` y `Event.subjectId` apuntan a una asignatura; borrarla limpia esas referencias en una sola entrada de historial y nunca borra tareas ni eventos. Sin base común, una asignatura local con el mismo nombre que una de la nube se considera la misma, igual que las etiquetas.

`lib/tasks/subjects.ts` contiene la lógica pura. Estar «al día» depende solo de la prioridad: no queda ninguna tarea pendiente que alcance el umbral (`PendingThreshold`: alta, media o alta —por defecto— o cualquiera). Las fechas no intervienen; las tareas vencidas solo se cuentan como dato. `Subject.manual` fija el estado a mano y manda sobre el cálculo. Con el umbral `manual` no se calcula nada: cada asignatura está como se haya marcado y, sin marcar, al día (`MANUAL_DEFAULT`). El estado se cambia desde su insignia en la pantalla principal (`StatusMenu`), no desde el diálogo de asignaturas. El umbral es una preferencia local del dispositivo. El mismo módulo reconoce los títulos con «examen» (se marcan como calificables) y los que contienen el nombre completo de una asignatura o uno de sus apodos (`Subject.aliases`; se asignan a ella; sin distinguir tildes ni mayúsculas, y gana el nombre más largo). Se aplica en tres momentos y nunca cambia una asignatura ya elegida:

- Al crear una tarea o un evento, mientras el usuario no toque esos campos.
- Al crear, renombrar, añadirle un apodo o desarchivar una asignatura (`applyTitleDetection` con `only`): lo que aún no tiene asignatura y la nombra pasa a ella, en una entrada de historial propia, así que «Deshacer» devuelve las asignaciones y conserva la asignatura.
- Una vez por dispositivo al cargar datos de versiones anteriores (`taskmaster-title-detection` en `localStorage`): los exámenes existentes pasan a calificables y las asignaturas existentes recogen lo que las nombra. El resultado cuenta como cambio local y se sube a la nube.

También construye el informe de notas (`buildGradeReport`), que solo promedia notas numéricas y calcula la media general como media de las medias por asignatura.

`context/subject-scope.tsx` guarda, en preferencias locales del dispositivo, si la función está activa y si la barra está contraída. El filtro no se guarda: la aplicación siempre abre en «todas». Con la función apagada el filtro efectivo es siempre «todas» y ningún componente pinta nada de asignaturas. El tablero y el calendario aplican el filtro con `scopeTasks`/`scopeEvents`; el color de un evento sin color propio se resuelve al mostrarlo y no se escribe en el dato.

## Invariantes de sincronización y datos

La escritura sobre una fila existente compara `updated_at` con la versión leída. Cero filas actualizadas o un conflicto de inserción (`23505`) obligan a leer y combinar de nuevo; no se avanza la base tras una escritura rechazada. La siguiente versión supera a la anterior incluso si el reloj local va atrasado.

El merge lee el estado local después de la espera de red. Si hay una edición durante la subida, se guarda el estado actual junto con la base que sí se confirmó, y la edición queda pendiente para otra ronda. La base y el estado siguen guardándose juntos por la cola de persistencia existente.

Una copia remota inválida se rechaza. Al cambiar a otra cuenta con datos locales, la recuperación debe completarse antes de sustituirlos. Las importaciones siguen validándose completas antes de modificar el historial. No se modifican autenticación, sesiones, esquema Supabase, JSONB, RLS ni formatos persistidos.

## Verificación y límites

`npm test` usa Node, el compilador TypeScript existente y fake-indexeddb. Las pruebas previas protegen formatos, migración, recuperación, orden, recurrencias y merge. `tests/sync-round.cjs` ejecuta la ronda real con una frontera Supabase simulada: actualizaciones e inserciones concurrentes, reconexión, ediciones durante I/O, cambios de cuenta y datos inválidos. `tests/task-operations.cjs` usa el renderer de servidor de React para obtener los comandos y ejecutarlos contra las transiciones puras del historial: no necesita navegador ni un framework nuevo.

`tests/sync-lifecycle.cjs` monta el hook real con `react-test-renderer` y un reloj determinista para verificar efectos, reintentos, reconexión y cambios de cuenta. Cada ciclo de cuenta tiene una generación: la limpieza invalida las peticiones anteriores, incluso al volver al mismo usuario, y una cuenta pendiente arranca cuando la ronda anterior libera su bloqueo.

Las pruebas locales no verifican políticas RLS desplegadas, entrega real de Realtime ni OAuth. CI conserva las comprobaciones de tipos, lint, pruebas y build, sin necesitar credenciales ni un proyecto externo. Las comprobaciones opcionales de navegador están descritas en [DEVELOPMENT.md](DEVELOPMENT.md).

Las pruebas de `tests/subjects.cjs` cubren la regla de «al día», el merge de asignaturas, el borrado con deshacer, la detección por título y las copias.

Las versiones anteriores a las asignaturas conservan `subjectId` en tareas y eventos pero suben el estado sin la lista `subjects`. `syncOnce` lee esa ausencia como «sin cambios desde la última base» (`withoutLegacyGaps`), no como «borradas», y vuelve a subir el estado completo; así un dispositivo sin actualizar no borra asignaturas ni asignaciones (`tests/sync-round.cjs`).

Se mantiene un único contexto y un hook de operaciones cohesivo: dividirlo por entidad o introducir repositorios genéricos añadiría coordinación sin una necesidad demostrada. Los cambios de persistencia o de resolución de conflictos requieren una revisión específica de integridad de datos.
