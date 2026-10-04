# Despliegue

## Vercel

La forma más sencilla es importar el repositorio de GitHub desde el panel de Vercel: detecta Next.js automáticamente y despliega en cada push a `main`.

Si activas login/sincronización, añade en `Project Settings` → `Environment Variables`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Desde la línea de comandos

Con un token de Vercel en `.env.local` (`VERCEL_TOKEN=...`, ignorado por Git):

```bash
source .env.local
npx -y vercel deploy --prod --yes --token "$VERCEL_TOKEN"
```

## Hosting estático (`dist/`)

Para generar una versión estática apta para cualquier hosting:

```bash
npm run build:dist
```

Publica el contenido de `dist/` conservando la carpeta `_next/`. La exportación incluye las variables públicas de Supabase disponibles durante la compilación.
