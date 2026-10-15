# Desarrollo

## Entorno

Usa Node.js 22, la misma versión principal que CI y `.nvmrc`. El mínimo declarado es Node.js 20, requerido por la dependencia de Supabase instalada. Si tienes nvm, puedes usar `nvm install` y `nvm use` (en nvm-windows, indica la versión 22 explícitamente).

```bash
npm ci
npm run dev
```

`npm ci` instala las versiones del lockfile. No necesitas variables de entorno para trabajar en modo local. Para activar autenticación y sincronización, copia `.env.example` a `.env.local` y sigue [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Comprobaciones

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI ejecuta estos cuatro pasos en los pull requests y en los pushes a `main`, sin credenciales de Supabase. Las ejecuciones antiguas de la misma rama se cancelan cuando llega una nueva.

`npm test` usa el runner de Node y el compilador TypeScript del proyecto. Las pruebas de datos usan fake-indexeddb; las del ciclo React montan el hook con react-test-renderer y un reloj determinista. No necesitan navegador ni acceso a la nube. Los casos de sincronización simulan Supabase: no validan políticas RLS desplegadas, OAuth ni la entrega real de Realtime.

## Scripts

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm start` | Sirve la compilación de producción |
| `npm run build:dist` | Exportación estática en `dist/` |
| `npm run typecheck` | Comprobación de tipos |
| `npm run lint` | ESLint |
| `npm test` | Pruebas de regresión, datos, historial y sincronización |

Para publicar una compilación, consulta [DEPLOY.md](DEPLOY.md).

## Dónde está cada cosa

```text
app/          Rutas, layout y estilos globales
components/   Tablero, calendario, ajustes y componentes de interfaz
context/      API de tareas y autenticación
hooks/        Operaciones, historial, ciclo de sincronización y otros hooks
lib/tasks/    Modelo, validación, recurrencias, orden y almacenamiento
lib/sync/     Merge y ronda de sincronización
lib/data/     IndexedDB, compresión y copias de seguridad
tests/        Pruebas ejecutadas con npm test
scripts/      Compilación y comprobaciones opcionales de navegador
docs/         Arquitectura, datos, diseño y configuración
```

El punto de entrada del estado es `context/task-context.tsx`. Las decisiones sobre sus límites y la integridad de datos están en [ARCHITECTURE.md](ARCHITECTURE.md).

## Comprobaciones opcionales de navegador

Los scripts de navegador son opcionales y usan Playwright instalado externamente; no forman parte de `npm test` ni de CI. No requieren añadir dependencias al proyecto. Para `browser-check.cjs`, utiliza una instalación existente de Playwright y Edge o Chrome ya instalado. Inicia el servidor en una terminal:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3210
```

En otra terminal PowerShell, desde la raíz del repositorio:

```powershell
$env:TEST_URL = "http://127.0.0.1:3210"
$env:PLAYWRIGHT_MODULE = "C:\ruta\a\node_modules\playwright"
$env:BROWSER_CHANNEL = "msedge" # O "chrome", si está instalado
node scripts/browser-check.cjs
```

`PLAYWRIGHT_MODULE` debe apuntar al paquete, no al ejecutable del navegador; puede omitirse si Node ya resuelve `playwright`. Este script bloquea las llamadas a Supabase y usa un contexto de navegador aislado. Las capturas se guardan en `artifacts/`. Para los otros scripts, las opciones existentes difieren:

| Scripts | Servidor y navegador |
| --- | --- |
| `board-sort-check.cjs`, `mobile-dnd-check.cjs` | `TEST_URL` (por defecto puerto 3015), `PLAYWRIGHT_MODULE`; Edge o `BROWSER_EXECUTABLE` |
| `calendar-mobile-navigation-check.cjs`, `requested-ux-check.cjs` | `TEST_URL` (puerto 3015), `PLAYWRIGHT_MODULE`; Edge |
| `design-qa.cjs`, `ux-smoke.cjs` | `QA_URL` (puerto 3000); resuelven Playwright por Node/`NODE_PATH` y requieren su Chromium disponible |

`ux-smoke.cjs` no bloquea las peticiones a Supabase; ejecútalo contra una instancia local sin configuración de nube. `NEXT_BUILD_DIR` permite aislar una compilación de pruebas del directorio `.next` habitual. No es necesario instalar navegadores adicionales para ejecutar las pruebas de regresión de Node.
