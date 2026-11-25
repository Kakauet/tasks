# Despliegue

La web oficial es [tasks-3-5.netlify.app](https://tasks-3-5.netlify.app/) y se publica en el proyecto `tasks-3-5` de Netlify.

Con la CLI de Netlify y una sesión iniciada, vincula el directorio al proyecto existente con `netlify link --name tasks-3-5`. Para publicar una versión, genera la exportación estática y sube `dist/` al proyecto:

```sh
npm run build:dist
netlify deploy --site tasks-3-5 --prod --no-build --dir dist
```

Para habilitar la sincronización, define `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.production.local` antes de compilar.
