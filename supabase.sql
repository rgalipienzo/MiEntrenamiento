-- Mi Entreno: tabla donde se guardan los datos de cada usuario.
-- Cópialo entero en Supabase → SQL Editor → New query, y pulsa «Run».

create table if not exists public.datos_usuario (
  user_id uuid primary key references auth.users (id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

-- Cada usuario solo puede ver y cambiar su propia fila.
alter table public.datos_usuario enable row level security;

drop policy if exists "ver lo mio" on public.datos_usuario;
create policy "ver lo mio" on public.datos_usuario
  for select using (auth.uid() = user_id);

drop policy if exists "crear lo mio" on public.datos_usuario;
create policy "crear lo mio" on public.datos_usuario
  for insert with check (auth.uid() = user_id);

drop policy if exists "cambiar lo mio" on public.datos_usuario;
create policy "cambiar lo mio" on public.datos_usuario
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
