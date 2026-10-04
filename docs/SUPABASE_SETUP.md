# Supabase Auth + Sync Setup

## 1) Crear proyecto y copiar variables

En tu proyecto de Supabase, copia:

- `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
- `anon public key` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Añádelas en `.env.local` (puedes partir de `.env.example`).

## 2) Crear tabla de sincronización

En Supabase SQL Editor, ejecuta:

```sql
create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"tasks":[],"events":[],"tags":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "Users can read own state" on public.user_state;
create policy "Users can read own state"
on public.user_state
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own state" on public.user_state;
create policy "Users can insert own state"
on public.user_state
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own state" on public.user_state;
create policy "Users can update own state"
on public.user_state
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

## 3) Activar Realtime para la tabla

En Supabase:

- `Database` -> `Replication`
- Activa `public.user_state`

Esto permite que dos dispositivos vean cambios casi en tiempo real.

## 4) Activar login por email

En Supabase:

- `Authentication` -> `Providers`
- Activa `Email`

### ¿Por qué a veces llega enlace y no código?

`signInWithOtp` usa la **plantilla de Magic Link** para decidir qué enviar:

- Si la plantilla incluye `{{ .ConfirmationURL }}` -> llega **enlace mágico**
- Si la plantilla incluye `{{ .Token }}` -> llega **código OTP**

Para enviar código en email:

1. Ve a `Authentication` -> `Email Templates` -> `Magic Link`
2. Sustituye el contenido para usar `{{ .Token }}`
3. Guarda cambios y vuelve a probar

Ejemplo mínimo de plantilla OTP:

```html
<h2>Código de acceso</h2>
<p>Tu código es: <strong>{{ .Token }}</strong></p>
```

## 5) Deploy

Si despliegas en Vercel, añade también esas dos variables en:

- `Project Settings` -> `Environment Variables`

Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 6) (Opcional) Login social

La app ahora muestra botones de `Google` y `GitHub`.

Para que funcionen:

1. Ve a `Authentication` -> `Providers`
2. Activa `Google` y/o `GitHub`
3. Configura Client ID/Secret del proveedor
4. Añade en el proveedor la URL de callback que te muestra Supabase
