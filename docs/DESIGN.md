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
