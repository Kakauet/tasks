# Copias de seguridad y registro de actividad

## Importar y exportar

Los accesos del tablero y del menú de ajustes utilizan el mismo diálogo.

- Exportación JSON legible o gzip (`.json.gz`), con datos, apariencia opcional e historial de actividad opcional. También puede descargarse solo la actividad para analizarla.
- Formato de copia versionado: `format: taskmaster-backup`, `version: 3`, fecha UTC de exportación, `payload` y SHA-256 del contenido canónico de `payload`. La comprobación detecta alteraciones accidentales; no demuestra quién creó el archivo. La compresión no cifra los datos.
- Importación desde archivo o JSON pegado. Reconoce gzip por su cabecera y acepta los formatos anteriores 1/2 y el estado sin envoltorio.
- No hay un máximo configurado de tareas, eventos o días de actividad. Como protección técnica para una operación individual, un archivo y su JSON descomprimido no pueden superar 512 MiB. La descompresión se controla mientras se lee. Los errores no aplican datos parcialmente validados.
- Valida estructura, fechas, campos obligatorios, listas e identificadores duplicados. Descarta campos desconocidos del estado. Avisa de referencias a etiquetas o eventos de origen ausentes, conservándolas para permitir combinar copias parciales.
- Vista previa: fecha, integridad, cantidades de tareas/eventos/etiquetas, conflictos y registros nuevos, actualizados, conservados o eliminados.
- Combinar: conserva el orden local y añade los nuevos identificadores. El usuario elige conservar su versión o la del archivo cuando un mismo identificador difiere. Los títulos iguales con identificadores diferentes siguen siendo registros distintos.
- Reemplazar: requiere marcar la confirmación y muestra los registros que desaparecerán.
- La apariencia y el historial solo se restauran si se marcan sus opciones. Restaurar actividad sustituye el historial; no lo fusiona. La preferencia de activar/desactivar el registro no se importa.
- Antes de cada importación se guarda una copia comprimida de recuperación. Si no puede guardarse, se detiene la importación. Si los datos cambian durante la preparación, se pide revisar la vista previa antes de reintentar.
- Se conservan las tres últimas copias de recuperación. Incluyen los datos y la apariencia anteriores; incluyen también la actividad anterior cuando se va a sustituir ese historial. Pueden seleccionarse desde Importar → Recuperar una versión anterior.
- Si los datos se importan pero falla la restauración opcional de apariencia/actividad, se informa expresamente. Son almacenes distintos; no existe una transacción única que abarque React, localStorage e IndexedDB.

## Datos completos de la aplicación incluidos en las copias

Estos campos contienen el contenido que el usuario ya guarda en la aplicación, y se mantienen separados del registro de interacciones:

| Tipo | Campos |
| --- | --- |
| Tarea | `id`, `title`, `description`, `status`, `priority`, `dueDate`, `weeklyPlanDate`, `weeklyPlanOrder`, `steps`, `tags`, `focusSeconds`, `focusSessions`, `createdAt`, `updatedAt` |
| Paso | `id`, `text`, `completed` |
| Evento | `id`, `title`, `description`, `date`, `endDate`, `startTime`, `endTime`, `isAllDay`, `isMultiDay`, `isGraded`, `grade`, `tags`, `recurrence`, `parentEventId`, `color` |
| Repetición | `type`, `interval`, `endDate`, `occurrences` |
| Etiqueta | `id`, `name`, `color` |
| Apariencia opcional | Tema claro/oscuro/sistema, preset de acento, preset oscuro y colores de las columnas |

Los campos opcionales se conservan cuando corresponden al estado normalizado de la aplicación. No se incluyen credenciales, sesión de Supabase, cachés, historial de deshacer/rehacer ni filtros transitorios como ajustes restaurables.

## Registro de interacciones: inventario completo

Cada entrada contiene:

- Fecha/hora Unix en milisegundos.
- Identificador aleatorio de sesión de la página. Una recarga genera otro; no es un identificador de cuenta.
- Número de secuencia de la entrada en esa sesión.
- Nombre del evento y los metadatos indicados a continuación.

Los identificadores de tareas y etiquetas se sustituyen por una clave de 8 caracteres derivada mediante FNV-1a. Sirve para relacionar acciones; puede tener colisiones, es seudonimización y no debe considerarse anonimización ni un mecanismo criptográfico.

| Evento | Información guardada |
| --- | --- |
| `session.start`, `session.resume` | Inicio de la página o reactivación del registro; sin campos adicionales. |
| `session.environment` | Ancho/alto del área visible redondeados a 100 px, disponibilidad de entrada táctil, idioma, zona horaria, estado de conexión y preferencia de reducir movimiento. Se toma al inicio y al reactivar el registro. |
| `session.focus`, `session.blur`, `session.pagehide` | Entrada/salida del foco y ocultación/salida de la página; sin campos adicionales. |
| `session.visibility` | Si la página está visible. |
| `session.network` | Si el navegador declara conexión disponible. |
| `session.pulse` | Tiempo transcurrido, estimación de tiempo activo, número de clics, muestras de movimiento, distancia acumulada aproximada del puntero en px, eventos de desplazamiento, ediciones de campos, cantidad y duración acumulada de tareas largas del hilo principal cuando el navegador lo permite. |
| `ui.click` | Tipo/rol del control, acción explícitamente etiquetada o `generic`, clave de la tarea si existe, si está dentro de un diálogo, posición aproximada en una cuadrícula 20×20 y si el clic fue generado sin un clic físico de ratón (`detail === 0`). No incluye etiquetas visibles del control. |
| `ui.scroll` | Área (`column` o `page`) y profundidad aproximada en incrementos del 5 %. |
| `form.edit` | Identificador de campo de una lista permitida y número de eventos de edición agrupados. Lista: `title`, `description`, `import-text`, `event-title`, `event-description`, `dueDate`; las búsquedas se clasifican `search` y el resto `other`. |
| `form.change` | Clasificación del campo y contexto del control: rol/tipo, acción, clave de tarea y si está dentro de un diálogo. Sin valor del campo. |
| `ui.shortcut` | Z/Y/F con Ctrl o Meta y si se pulsó Shift, fuera de campos editables. |
| `ui.navigation_key` | Escape o Tab y Shift, fuera de campos editables. |
| `view.change` | Vista principal observada: tablero o calendario. |
| `dialog.open`, `dialog.close` | Cantidad de diálogos abiertos tras el cambio observado. |
| `tasks.create`, `tasks.update` | Clave de tarea, nombres de campos modificados, longitudes de título/descripción, número de etiquetas, estado, prioridad, cantidad de pasos y pasos completados, si tiene vencimiento y planificación semanal. En modificaciones: estado y prioridad anteriores. |
| `events.create`, `events.update` | Clave de evento, nombres de campos modificados, longitudes de título/descripción, número de etiquetas, indicadores de día completo, varios días, repetición, evaluable y presencia de nota. |
| `tags.create`, `tags.update` | Clave de etiqueta y nombres de campos modificados. No guarda su nombre ni color como valores de actividad. |
| `tasks.delete`, `events.delete`, `tags.delete` | Clave del registro eliminado. |
| `data.change` | Tipo de colección, cantidad de registros creados/modificados, eliminados y total posterior; si cambió la secuencia de identificadores de la colección, incluidas altas/bajas. |
| `history.undo`, `history.redo` | Uso de deshacer/rehacer, además de los cambios estructurales resultantes. |
| `board.filter` | Longitud de búsqueda, claves de hasta 100 etiquetas seleccionadas, cantidad total de etiquetas seleccionadas, prioridades y número de resultados. No guarda la búsqueda. |
| `board.selection` | Cantidad de tareas seleccionadas y si está activado el modo de selección múltiple. |
| `board.mobile_column` | Columna seleccionada en el selector móvil; también registra su estado inicial. |
| `board.sort_scope` | Columna o todas las columnas elegidas como ámbito. |
| `board.sort` | Ámbito y criterio de ordenación. |
| `calendar.navigate` | Vista del calendario y distancia en meses respecto al mes actual. |
| `calendar.select` | Distancia en días entre el día seleccionado y hoy. |
| `task.drag_start` | Clave de tarea, estado de origen y prioridad. |
| `task.drag_end` | Clave de tarea, estado de origen/destino, si se completó una entrega válida y duración del arrastre. |
| `event.drag_start` | Clave del evento, desplazamiento en días del segmento agarrado respecto al inicio e indicador de varios días. |
| `event.drag_end` | Clave del evento, si se soltó sobre un día válido, desplazamiento en días y duración del arrastre. |
| `preference.change` | Ajuste de apariencia, preset/tema elegido y columna si corresponde. |
| `backup.inspect` | Tamaño del archivo, si es antiguo y cantidades de tareas/eventos/etiquetas. |
| `backup.export` | Tamaño final, uso de compresión e inclusión de apariencia/actividad. |
| `backup.import` | Modo, política de conflictos, cantidades nuevas/actualizadas/eliminadas y opciones de apariencia/actividad solicitadas. |
| `backup.error` | Fase que falló: analizar, exportar o importar. No guarda el mensaje de error ni el archivo. |
| `runtime.error`, `runtime.rejection` | Ocurrencia de un error global o promesa rechazada; sin mensajes, rutas, código ni trazas. |
| `storage.overflow` | Cantidad de eventos descartados por saturación del búfer, cuando hay capacidad para guardar el aviso. |

Los cambios estructurales incluyen altas, ediciones, pasos, estados, prioridades, etiquetas asignadas, fechas, planificación, operaciones masivas e importaciones que pasan por el estado de la aplicación. No se convierten las cargas iniciales ni la recepción de datos remotos en supuestas acciones del usuario. El calendario utiliza los mismos eventos estructurales al modificar sus registros. Los eventos de inicio de vista/filtro no implican necesariamente un gesto del usuario.

### Información excluida del registro

No lee ni guarda contraseñas, email, teléfono, códigos OTP, tokens, contenido del portapapeles, contenido de los archivos, nombres de archivo, texto de campos, búsquedas, títulos, descripciones, pasos, notas/calificaciones, nombres de etiquetas, enlaces, direcciones visitadas, IP, ubicación GPS, capturas, audio, vídeo ni secuencias completas de teclas. No registra trayectorias precisas del puntero. Excluye el detalle de clics y cambios en el panel de autenticación y campos sensibles. Los contadores generales de uso pueden incluir que hubo actividad allí, sin su contenido.

El texto completo de tareas/eventos/pasos sí forma parte de los datos normales y sus copias, como se indica en la tabla anterior. Las métricas de actividad describen ese contenido mediante longitudes, cantidades y nombres de campos.

## Almacenamiento, compresión y límites

- Se activa por defecto y se guarda exclusivamente en IndexedDB del navegador/origen actual (`taskmaster-local-data`, almacenes `activity` y `daily`). No se añade a `AppState`, a Supabase ni a servicios de analítica.
- Las tareas, eventos y etiquetas locales se guardan comprimidos en el almacén `state` de IndexedDB. Al arrancar, una instalación anterior migra desde `localStorage`. Si IndexedDB falla, se intenta conservar la versión más reciente en `localStorage` y se avisa; ese mecanismo alternativo puede agotarse antes.
- Se pueden pausar las nuevas entradas, exportarlas o borrarlas desde Exportar → Actividad local y almacenamiento. La pausa no borra el historial existente. Las métricas pendientes de interacción se reinician al cambiar la preferencia para evitar incorporar el intervalo desactivado después.
- Los lotes usan diccionarios para sesiones/nombres de evento, diferencias de tiempo y filas compactas, más gzip nativo. Si el navegador no ofrece compresión, se utiliza JSON.
- El detalle y los resúmenes diarios **no se eliminan por edad, número de entradas ni un límite de tamaño fijado por la aplicación**. Su crecimiento depende del espacio que conceda el navegador. Los resúmenes conservan conteos por nombre de evento y suma de tiempo activo; por ejemplo, un `session.pulse` puede contener muchos movimientos.
- Ajustes → **Datos y almacenamiento** muestra cantidades de tareas/eventos/etiquetas, espacio comprimido para cada categoría, cantidad de interacciones, días registrados y copias de recuperación. «Espacio conocido» suma el tamaño de los datos que la aplicación puede medir. Si el navegador ofrece una estimación de uso/cuota del sitio, se presenta aparte porque también incluye caché y otros datos.
- Se intenta guardar cada 5 segundos o al alcanzar 64 entradas; se intenta vaciar también al perder foco/visibilidad y al salir. Una exportación espera al guardado pendiente y falla explícitamente si no puede guardarlo.
- El búfer de espera está limitado a 1.024 entradas para contener el uso de memoria. Un fallo de almacenamiento se comunica en el panel y se reintenta. Si se satura, se descartan las más antiguas y se acumula un contador de pérdidas.
- Las métricas de sesión se agrupan cada 15 segundos y en cambios de foco/visibilidad. El tiempo activo es una estimación mientras la página está visible y enfocada, hasta 60 segundos tras la última interacción. Varias pestañas abiertas pueden producir sesiones y tiempos solapados.
- Movimiento del puntero: como máximo una muestra cada 100 ms, guardando únicamente cantidad y distancia agregadas. Desplazamiento: como máximo una entrada detallada por segundo. Filtros: se registran tras 600 ms sin cambios relevantes.
- Una operación masiva guarda hasta 100 altas/modificaciones y 100 eliminaciones individuales por colección; conserva además sus cantidades agregadas. No es una grabación exacta de todas las acciones ni un registro de auditoría sin pérdidas.
- El navegador puede interrumpir una escritura al cerrarse: un cierre forzado puede perder entradas o métricas pendientes. Borrar los datos del sitio elimina este almacenamiento. Cambiar dominio, puerto o navegador da acceso a otro almacén. Las copias descargadas permiten trasladar los datos.
- Las tres copias de recuperación ocupan espacio adicional y se comprimen aparte. Borrar el historial activo no modifica esas copias ni archivos ya descargados. Importar una copia con actividad conserva las entradas antiguas que contenga.

## Formato para análisis futuro

La actividad exportada contiene `version: 1`, `batches` y `daily`. La descarga independiente añade `format: taskmaster-activity`; está destinada al análisis. Para restaurar actividad desde la interfaz se utiliza una copia completa que la incluya.

Cada lote contiene `base`, `sessions`, `names` y filas de la forma:

```text
[diferenciaMs, índiceSesión, secuencia, índiceNombreEvento, metadatos]
```

La fecha se reconstruye como `base + diferenciaMs`. El nombre y la sesión se resuelven con sus diccionarios. Cada resumen diario contiene `id` (fecha UTC), `counts` y `activeMs`. Los esquemas tienen versión propia para permitir migraciones futuras.

## Verificación

Pruebas automatizadas en `tests/data-and-activity.cjs`: JSON/gzip, integridad, corrupción, expansión descomprimida, compatibilidad antigua, campos desconocidos, duplicados, conflictos, pausa, exclusión del contenido de tareas, persistencia en IndexedDB simulado, conservación después de un año y por encima de 4 MiB/50.000 entradas, migración del estado local y recuperación de las tres últimas copias. Se ejecutan junto con las regresiones existentes mediante `npm test`. No se hacen comprobaciones visuales automatizadas.
