# TaskMaster

[![CI](https://github.com/Kakauet/tasks/actions/workflows/ci.yml/badge.svg)](https://github.com/Kakauet/tasks/actions/workflows/ci.yml) [![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

TaskMaster es la app que me he hecho para organizarme. La uso sobre todo para los estudios: tener a mano las tareas pendientes, las entregas y los exámenes, y ver cómo se reparte todo en el calendario.

Está hecha a mi medida, con una forma de organizar las cosas que me resulta cómoda: mover tareas por el tablero, cambiar fechas arrastrando eventos y ver de un vistazo lo que tengo por delante. La comparto aquí por si a alguien más le sirve o quiere ver cómo está montada.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/board.jpg" alt="Tablero de tareas"></td>
    <td width="50%"><img src="docs/screenshots/calendar-month.jpg" alt="Calendario mensual"></td>
  </tr>
  <tr>
    <td align="center">Tablero de tareas</td>
    <td align="center">Calendario mensual</td>
  </tr>
</table>

## Cómo la uso

- En el **tablero** separo lo que tengo por hacer, lo que está en marcha y lo que ya he terminado. Puedo arrastrar las tareas, ordenarlas y dividirlas en pasos.
- En el **calendario** coloco exámenes, entregas y otros eventos. Hay vistas de mes y semana, eventos de varios días y repeticiones.
- Con **etiquetas, prioridades y fechas** organizo las tareas y encuentro lo que me interesa. Los eventos evaluables permiten guardar también la nota.
- El **temporizador de foco** me sirve para dedicar un rato a una tarea y llevar la cuenta del tiempo.

También tiene deshacer/rehacer, acciones en bloque y opciones de apariencia. El tablero se puede usar tanto con ratón como desde el móvil.

## Tus datos

Se puede usar sin cuenta. Las tareas y los eventos se guardan en el navegador con IndexedDB; para conservar una copia fuera de ese navegador puedes exportarlos en JSON o gzip e importarlos después.

La sincronización entre dispositivos es opcional y usa Supabase. Si no la configuras, la aplicación sigue funcionando en modo local. Los detalles sobre copias de seguridad, recuperación y registro local de actividad están en [Datos y actividad](docs/DATA_AND_ACTIVITY.md).

## Probarla en local

Usa **Node.js 22** y npm. La versión está indicada en `.nvmrc` y es la que usa CI.

```bash
git clone https://github.com/Kakauet/tasks.git
cd tasks
npm ci
npm run dev
```

Abre [localhost:3000](http://localhost:3000). No hace falta configurar nada más para usarla en modo local.

Para sincronizar, copia `.env.example` a `.env.local`, rellena las variables de Supabase y sigue la [guía de configuración](docs/SUPABASE_SETUP.md). Después reinicia el servidor.

## Código y pruebas

Está hecha con Next.js 14, React 18 y TypeScript. La interfaz usa Tailwind CSS, componentes de shadcn/ui y react-dnd; los datos locales se guardan en IndexedDB y la nube va por Supabase.

Antes de subir cambios:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

GitHub Actions ejecuta estas mismas comprobaciones. Las pruebas locales no necesitan cuentas, credenciales ni un navegador instalado.

Si quieres explorar el código o hacer cambios:

- [Desarrollo](docs/DEVELOPMENT.md): estructura, comandos y comprobaciones de navegador.
- [Arquitectura](docs/ARCHITECTURE.md): estado, historial, persistencia y sincronización.
- [Diseño](docs/DESIGN.md): colores y componentes de la interfaz.
- [Despliegue](docs/DEPLOY.md): Vercel o exportación estática.

## Sobre el proyecto

Lo voy adaptando a lo que necesito para estudiar y organizarme. Si encuentras un fallo o tienes una idea, puedes abrir una issue; ayuda mucho incluir los pasos para reproducirlo y el navegador que usas. Para proponer un cambio grande, mejor comentarlo primero.

## Licencia

[MIT](LICENSE).
