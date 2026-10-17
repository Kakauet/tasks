# Sistema de diseño de Taskmaster

Este documento es la fuente de verdad visual del producto. Los estilos base viven en `app/globals.css`, los componentes reutilizables en `components/ui` y los colores personalizables en `lib/appearance.ts`.

## 1. Principios

1. **La información manda.** La jerarquía se consigue con tamaño, peso, espacio y contraste; no añadiendo colores o contenedores innecesarios.
2. **Una superficie, una función.** Fondo, panel, tarjeta y elemento flotante deben distinguirse con cambios pequeños y consistentes.
3. **El color comunica estado.** El acento identifica acciones y selección. Rojo, ámbar y verde se reservan para peligro, atención y éxito.
4. **Densidad tranquila.** El tablero puede contener mucha información, pero debe conservar respiración, alineación y controles previsibles.
5. **Claro y oscuro son el mismo sistema.** Cambia la luminosidad, no la jerarquía ni el significado de los colores.

## 2. Tokens

Todos los colores funcionales deben referenciar variables HSL. No se añaden hexadecimales o colores Tailwind directos en una vista salvo colores elegidos por el usuario para etiquetas y eventos.

### Superficies

| Token | Uso |
| --- | --- |
| `--background` | Lienzo de la aplicación |
| `--card` | Tarjetas, columnas elevadas y paneles |
| `--popover` | Diálogos, menús y desplegables |
| `--muted` | Agrupaciones, pistas y fondos secundarios |
| `--border` | Separadores y bordes normales |
| `--input` | Borde de campos editables |

### Semántica

| Token | Significado permitido |
| --- | --- |
| `--primary` | CTA, selección, foco y progreso activo |
| `--status-danger` | Vencido, error o acción destructiva |
| `--status-warning` | Vence hoy o requiere atención inmediata |
| `--status-caution` | Prioridad media o plazo cercano |
| `--status-success` | Completado o prioridad baja |

Las versiones `*-soft` son fondos de apoyo. Nunca se usa un color semántico saturado como fondo de un área grande.

## 3. Tipografía

- Familia: `Segoe UI Variable`, con `Inter` y `system-ui` como respaldo.
- Texto base: 14 px en escritorio y 16 px en campos táctiles.
- Títulos de tarjeta: 15 px, semibold, interlineado compacto.
- Títulos de modal: 18 px, semibold.
- Etiquetas auxiliares: 11–12 px, semibold; mayúsculas solo en encabezados de sección cortos.
- Los párrafos usan un interlineado de 1.5 como mínimo.

No usar fuentes decorativas, tracking exagerado, mayúsculas en frases completas ni más de tres pesos tipográficos en una misma pantalla.

## 4. Espaciado y geometría

La unidad base es 4 px. Espacios habituales: 8, 12, 16, 20, 24 y 32 px.

- Encabezado y contenido comparten un ancho máximo de 1600 px y el mismo margen interior horizontal: 12 px en móvil y 24 px desde `sm`.
- Entre bloques principales se usan 8 px en móvil y 12 px desde `sm`; dentro de un panel, las secciones pueden separarse 16 px.
- La cabecera y el contenido de un mismo panel comparten el mismo margen horizontal.

- Campos y botones: 40 px de alto; 44 px en dispositivos táctiles.
- Radio de controles: 12 px; los elementos muy compactos usan 6 u 8 px.
- Radio de tarjetas y paneles: 16 px.
- Radio de diálogos y paneles destacados: 20 px.
- En contenedores anidados, `radio interior = radio exterior − separación`. Ejemplos: 16 px con padding de 4 px contiene 12 px; 20 px con padding de 12 px contiene 8 px. Así ambos arcos comparten centro.
- El radio completamente circular se reserva para badges, avatares e indicadores; no para cada botón o pestaña.
- Las sombras son suaves. Un panel normal usa `--shadow-panel`; menús y diálogos usan `--shadow-floating`.

## 5. Componentes

### Botones

- Una sola acción primaria visible por grupo.
- Las acciones secundarias usan `outline`; las utilitarias, `ghost`.
- Una acción destructiva no se pinta de rojo hasta que sea explícita o esté en confirmación.
- Los iconos acompañan al texto; un botón solo con icono requiere `aria-label` y tooltip cuando su significado no sea universal.

### Campos

- Mismo fondo, borde, radio y foco para `Input`, `Textarea` y `Select`.
- Las descripciones crecen con el contenido hasta 240 px y después muestran scroll interno.
- No fijar alturas de contenido que puedan cortar texto traducido o introducido por el usuario.

### Tarjetas de tarea

- El título y la descripción ocupan altura natural.
- Metadatos en chips rectangulares suaves; etiquetas de usuario siguen siendo badges.
- El estado vencido cambia el borde **interior** de la tarjeta. No usar `ring` exterior dentro de un contenedor con overflow porque puede quedar recortado.
- El progreso solo aparece si existen pasos.
- Las acciones se agrupan tras un separador y no compiten con el contenido.

### Columnas

- Una línea superior fina identifica el estado; no se tiñe toda la columna.
- Debe existir padding alrededor de la primera y última tarjeta.
- El área de scroll pertenece al contenido, no al encabezado.

### Calendario

- La cuadrícula usa un único borde y separadores de 1 px.
- Domingo se comunica mediante el texto rojo y un matiz casi imperceptible; nunca mediante un bloque rojo dominante.
- Hoy y selección se diferencian con el acento, sin superponer más de dos tratamientos.
- El día de hoy siempre conserva visible su número; el punto de acento es un indicador adicional.
- Un clic abre el detalle. Editar requiere una acción explícita desde ese detalle.
- En móvil, tocar un evento dentro de un día selecciona la fecha; el evento se abre desde el panel de detalle inferior.
- Los eventos se pueden arrastrar a otra fecha; en táctil siempre existe también un selector «Mover a otra fecha».
- Al mover un evento de varios días se conserva su duración y el segmento agarrado permanece bajo el puntero.

### Diálogos

- Cabecera, contenido desplazable y pie deben ser regiones visualmente claras.
- Los formularios largos comparten el mismo espaciado interior: 20 px en móvil y 24 px desde `sm`; solo el cuerpo se desplaza.
- El pie permanece estable y agrupa cancelar/guardar a la derecha; eliminar queda separado a la izquierda.
- Los diálogos no usan glassmorphism ni fondos transparentes.

### Asignaturas

- Son opcionales: apagadas, no queda ni rastro en la interfaz. La barra lateral es un filtro (qué asignatura), no una navegación; las pestañas de arriba siguen siendo la vista (tablero o calendario).
- Panel de 16 px con padding de 8 px y elementos de 8 px (radio concéntrico). Se contrae a una columna de iconos y, por debajo de `lg`, se sustituye por un selector compacto en la cabecera, junto a las pestañas: no añade filas en móvil. El resumen de la asignatura vive dentro de ese selector.
- La franja de resumen de una asignatura es una sola fila con la misma altura que la barra de búsqueda (solo desde `md`). Los datos van por orden de importancia y solo el título del próximo plazo se recorta.
- Movimiento: plegar, desplegar, activar y desactivar animan el ancho en 300 ms con `cubic-bezier(0.32, 0.72, 0, 1)`, sin rebote. Los iconos no se mueven; los textos se apagan antes de que el ancho los recorte y vuelven con un pequeño retraso. La selección es un único fondo que se desliza (200 ms). Cambiar de asignatura no anima el contenido: el tablero y el calendario cambian al instante, sin fundidos ni tarjetas que vuelen desde su posición anterior (la animación de reordenar queda solo para arrastrar y ordenar).
- El estado se comunica con color **e** icono: `--status-success` con ✓ (al día) y `--status-caution` con reloj (pendiente). Nunca se tiñen fondos grandes, y el rojo queda reservado a lo vencido en las tarjetas.
- Las notas y medias viven en un diálogo aparte (botón «Notas» al pie de la barra), no en la pantalla principal; en la franja de una asignatura solo aparece su media como un dato más.
- Una tarea o evento muestra un chip de asignatura solo cuando se ven varias a la vez; con una asignatura filtrada sería redundante.
- La insignia de estado de la asignatura filtrada es también su menú (como los puntos de prioridad de una tarea): «Automático» con lo que dice el cálculo, «Siempre al día» y «Siempre pendiente»; en modo manual, solo «Al día» y «Pendiente». La chincheta solo aparece cuando una asignatura está fijada a mano mientras las demás se calculan.
- La edición de una asignatura cabe en dos filas: nombre y color; apodos y acciones. Los apodos son discretos: sin etiqueta visible (su explicación va en el `title`) y no se repiten en la lista.
- Los apodos se editan como fichas dentro de un campo con el mismo aspecto que un `Input` (Intro o coma añaden, Retroceso en vacío quita la última). Cualquier asignación automática por título se avisa con un toast con «Deshacer».

## 6. Estados e interacción

- Hover: 150 ms; puede cambiar fondo, borde o elevar 1 px.
- Foco: anillo de 2 px con `--ring`, siempre visible por teclado.
- Drag: opacidad reducida; el destino usa el acento.
- Disabled: opacidad 45–50 %, sin interacción.
- Respetar `prefers-reduced-motion`.

## 7. Accesibilidad

- Contraste mínimo AA: 4.5:1 para texto normal y 3:1 para texto grande o elementos gráficos esenciales.
- El color nunca es la única pista: acompañar estados con icono o texto.
- Objetivos táctiles de al menos 44 × 44 px.
- Mantener navegación por teclado, nombres accesibles y regiones semánticas.

## 8. Reglas que no se deben romper

- No introducir colores arbitrarios en vistas; usar tokens.
- No usar rojo o verde como decoración.
- No mezclar radios de píldora, cuadrados y esquinas grandes en el mismo grupo.
- No repetir el mismo radio en dos bordes anidados separados por padding; aplicar la fórmula concéntrica.
- No apilar borde, ring y sombra intensa para representar un único estado.
- No usar blur o transparencia en todas las superficies.
- No añadir gradientes decorativos salvo un matiz funcional muy sutil.
- No truncar descripciones de tareas ni fijar su altura.
- No ocultar acciones críticas solo mediante hover en pantallas táctiles.
- No reducir texto auxiliar por debajo de 11 px.

## 9. Checklist para nuevas pantallas

- ¿Usa únicamente tokens semánticos?
- ¿Existe una sola acción primaria por grupo?
- ¿Los radios siguen la escala 6/8/12/16/20 y coinciden los centros de los bordes anidados?
- ¿Hay contraste claro entre lienzo, panel y tarjeta?
- ¿El contenido largo crece o hace scroll sin recortarse?
- ¿Los estados vencido, hoy, seleccionado y completado se distinguen sin ruido?
- ¿Funciona a 390 px y en modo claro/oscuro?
- ¿Se puede recorrer y operar con teclado?
