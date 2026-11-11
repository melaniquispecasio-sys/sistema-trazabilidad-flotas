-- =====================================================================
--  SISTEMA WEB DE GESTIÓN Y TRAZABILIDAD DE FLOTAS LOGÍSTICAS (Grupo 3)
--  Script 1/2: tablas, reglas de negocio, seguridad (RLS) y funciones.
--
--  CÓMO USARLO: Supabase → SQL Editor → New query → pegar TODO este
--  archivo → botón "Run". Se puede volver a ejecutar sin problemas.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Perfil de cada usuario de Supabase Auth, con su rol.
create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  nombre     text not null,
  rol        text not null default 'operador' check (rol in ('admin','operador')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- Vehículos de la flota (RF02) con su identificador QR único (RF03).
create table if not exists public.vehiculos (
  id         uuid primary key default gen_random_uuid(),
  placa      text not null unique
             check (placa ~ '^[A-Z0-9]{3}-[0-9]{3}$'),
  marca      text not null check (length(trim(marca)) between 2 and 40),
  modelo     text not null check (length(trim(modelo)) between 1 and 40),
  anio       int  not null check (anio between 1980 and 2100),
  estado     text not null default 'disponible'
             check (estado in ('disponible','en_ruta','mantenimiento','inactivo')),
  qr_token   uuid not null unique default gen_random_uuid(),
  creado_por uuid references public.perfiles(id) default auth.uid(),
  creado_en  timestamptz not null default now()
);

-- Almacenes con su geocerca circular (RF04).
create table if not exists public.almacenes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique check (length(trim(nombre)) between 3 and 80),
  direccion  text not null check (length(trim(direccion)) >= 3),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  radio_m    int not null default 200 check (radio_m between 20 and 5000),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- Movimientos (entradas / salidas) validados (RF09).
-- NADIE puede insertar directamente: solo la función registrar_movimiento().
create table if not exists public.movimientos (
  id              bigint generated always as identity primary key,
  vehiculo_id     uuid not null references public.vehiculos(id) on delete restrict,
  almacen_id      uuid not null references public.almacenes(id) on delete restrict,
  tipo            text not null check (tipo in ('entrada','salida')),
  operador_id     uuid not null references public.perfiles(id),
  registrado_en   timestamptz not null default now(),   -- HORA DEL SERVIDOR
  lat             double precision not null,
  lng             double precision not null,
  precision_m     double precision not null,
  distancia_m     double precision not null,            -- calculada en el servidor
  direccion       text,                                 -- obtenida con Nominatim
  observacion     text
);
create index if not exists idx_mov_vehiculo_fecha on public.movimientos (vehiculo_id, registrado_en desc);
create index if not exists idx_mov_fecha on public.movimientos (registrado_en desc);

-- Intentos de registro rechazados (auditoría de reglas de negocio).
create table if not exists public.escaneos_rechazados (
  id           bigint generated always as identity primary key,
  vehiculo_id  uuid references public.vehiculos(id) on delete set null,
  almacen_id   uuid references public.almacenes(id) on delete set null,
  tipo         text,
  operador_id  uuid references public.perfiles(id),
  lat          double precision,
  lng          double precision,
  precision_m  double precision,
  distancia_m  double precision,
  motivo       text not null,
  creado_en    timestamptz not null default now()
);
create index if not exists idx_rech_fecha on public.escaneos_rechazados (creado_en desc);

-- Parámetros de negocio editables por el administrador (una sola fila).
create table if not exists public.parametros (
  id                    int primary key default 1 check (id = 1),
  precision_max_m       int not null default 100 check (precision_max_m between 5 and 2000),
  intervalo_minimo_seg  int not null default 60  check (intervalo_minimo_seg between 0 and 3600)
);
insert into public.parametros (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES DE SEGURIDAD
-- ---------------------------------------------------------------------

create or replace function public.es_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo);
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo and rol = 'admin');
$$;

-- Distancia en metros entre dos coordenadas (fórmula de Haversine).
create or replace function public.distancia_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
         ));
$$;

-- ---------------------------------------------------------------------
-- 3. PERFIL AUTOMÁTICO AL CREAR UN USUARIO
--    El PRIMER usuario del sistema será administrador; los demás, operadores.
-- ---------------------------------------------------------------------

create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nombre'), ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from perfiles where rol = 'admin') then 'operador' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Crear perfiles para usuarios que ya existían antes de ejecutar este script.
insert into public.perfiles (id, email, nombre, rol)
select u.id, u.email, split_part(u.email, '@', 1), 'operador'
from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id)
order by u.created_at;
-- Si ningún perfil es admin, el usuario más antiguo pasa a serlo.
update public.perfiles set rol = 'admin'
where id = (select id from public.perfiles order by creado_en limit 1)
  and not exists (select 1 from public.perfiles where rol = 'admin');

-- ---------------------------------------------------------------------
-- 4. REGLA DE NEGOCIO PRINCIPAL: registrar entrada / salida (RF08, RF09)
--    Todo se valida AQUÍ, en el servidor (lado seguro):
--      - usuario autenticado y activo
--      - vehículo existe (por su token QR) y no está inactivo / en mantenimiento
--      - almacén existe y está activo
--      - precisión del GPS aceptable
--      - distancia calculada en el servidor ≤ radio del almacén (geocerca)
--      - secuencia lógica entrada → salida (evita duplicados)
--      - intervalo mínimo entre registros del mismo vehículo
--      - hora tomada del servidor, operador tomado de la sesión
--    Si algo falla, NO se guarda el movimiento y se registra el rechazo.
-- ---------------------------------------------------------------------

create or replace function public.registrar_movimiento(
  p_qr_token    uuid,
  p_almacen_id  uuid,
  p_tipo        text,
  p_lat         double precision,
  p_lng         double precision,
  p_precision   double precision,
  p_direccion   text default null,
  p_observacion text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_veh     vehiculos%rowtype;
  v_alm     almacenes%rowtype;
  v_par     parametros%rowtype;
  v_ult     movimientos%rowtype;
  v_ult_alm text;
  v_dist    double precision;
  v_motivo  text;
  v_mov     movimientos%rowtype;
begin
  -- Autenticación (esto sí corta la ejecución: no se audita a anónimos)
  if v_uid is null then
    raise exception 'Debe iniciar sesión.' using errcode = '28000';
  end if;
  if not es_activo() then
    raise exception 'Su usuario está desactivado.' using errcode = '42501';
  end if;

  select * into v_par from parametros where id = 1;

  -- Validaciones de datos de entrada
  if p_tipo is null or p_tipo not in ('entrada','salida') then
    v_motivo := 'Tipo de movimiento inválido.';
  elsif p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    v_motivo := 'Coordenadas GPS inválidas.';
  elsif p_precision is null or p_precision <= 0 then
    v_motivo := 'Precisión GPS inválida.';
  end if;

  -- Vehículo (bloqueado con FOR UPDATE para evitar dobles registros simultáneos)
  if v_motivo is null then
    select * into v_veh from vehiculos where qr_token = p_qr_token for update;
    if not found then
      v_motivo := 'El código QR no corresponde a ningún vehículo registrado (puede haber sido regenerado).';
    elsif v_veh.estado = 'inactivo' then
      v_motivo := format('El vehículo %s está INACTIVO.', v_veh.placa);
    elsif v_veh.estado = 'mantenimiento' then
      v_motivo := format('El vehículo %s está en MANTENIMIENTO.', v_veh.placa);
    end if;
  end if;

  -- Almacén
  if v_motivo is null then
    select * into v_alm from almacenes where id = p_almacen_id;
    if not found then
      v_motivo := 'El almacén no existe.';
    elsif not v_alm.activo then
      v_motivo := format('El almacén %s está desactivado.', v_alm.nombre);
    end if;
  end if;

  -- Geocerca: precisión y distancia (calculada AQUÍ, no en el navegador)
  if v_alm.id is not null and p_lat is not null and p_lng is not null then
    v_dist := distancia_m(p_lat, p_lng, v_alm.lat, v_alm.lng);
  end if;
  if v_motivo is null and p_precision > v_par.precision_max_m then
    v_motivo := format('Precisión GPS insuficiente: ±%s m (máximo permitido ±%s m). Acérquese a una zona abierta y vuelva a intentar.',
                       round(p_precision::numeric), v_par.precision_max_m);
  end if;
  if v_motivo is null and v_dist > v_alm.radio_m then
    v_motivo := format('Fuera de la geocerca: está a %s m de %s (radio permitido %s m).',
                       round(v_dist::numeric), v_alm.nombre, v_alm.radio_m);
  end if;

  -- Secuencia lógica y duplicados
  if v_motivo is null then
    select * into v_ult from movimientos
     where vehiculo_id = v_veh.id
     order by registrado_en desc, id desc limit 1;

    if found then
      select nombre into v_ult_alm from almacenes where id = v_ult.almacen_id;

      if now() - v_ult.registrado_en < make_interval(secs => v_par.intervalo_minimo_seg) then
        v_motivo := format('Registro duplicado: el vehículo %s ya tuvo un movimiento hace menos de %s segundos.',
                           v_veh.placa, v_par.intervalo_minimo_seg);
      elsif p_tipo = 'entrada' and v_ult.tipo = 'entrada' then
        if v_ult.almacen_id = v_alm.id then
          v_motivo := format('Duplicado: el vehículo %s ya tiene registrada su ENTRADA en %s.', v_veh.placa, v_alm.nombre);
        else
          v_motivo := format('El vehículo %s figura dentro de %s. Primero registre su SALIDA de ese almacén.', v_veh.placa, v_ult_alm);
        end if;
      elsif p_tipo = 'salida' and v_ult.tipo = 'salida' then
        if v_ult.almacen_id = v_alm.id then
          v_motivo := format('Duplicado: el vehículo %s ya tiene registrada su SALIDA de %s.', v_veh.placa, v_alm.nombre);
        else
          v_motivo := format('El vehículo %s salió de %s y no tiene ENTRADA en %s. Registre primero la entrada.', v_veh.placa, v_ult_alm, v_alm.nombre);
        end if;
      elsif p_tipo = 'salida' and v_ult.tipo = 'entrada' and v_ult.almacen_id <> v_alm.id then
        v_motivo := format('El vehículo %s está registrado en %s, no en %s.', v_veh.placa, v_ult_alm, v_alm.nombre);
      end if;
    end if;
  end if;

  -- ¿Rechazado? → se audita y se informa
  if v_motivo is not null then
    insert into escaneos_rechazados (vehiculo_id, almacen_id, tipo, operador_id, lat, lng, precision_m, distancia_m, motivo)
    values (v_veh.id, v_alm.id, p_tipo, v_uid, p_lat, p_lng, p_precision, v_dist, v_motivo);
    return jsonb_build_object('ok', false, 'mensaje', v_motivo,
                              'distancia_m', round(v_dist::numeric, 1),
                              'placa', v_veh.placa, 'almacen', v_alm.nombre);
  end if;

  -- Registro válido
  insert into movimientos (vehiculo_id, almacen_id, tipo, operador_id, lat, lng, precision_m, distancia_m, direccion, observacion)
  values (v_veh.id, v_alm.id, p_tipo, v_uid, p_lat, p_lng, p_precision, v_dist,
          left(nullif(trim(p_direccion), ''), 300), left(nullif(trim(p_observacion), ''), 300))
  returning * into v_mov;

  update vehiculos
     set estado = case when p_tipo = 'entrada' then 'disponible' else 'en_ruta' end
   where id = v_veh.id;

  return jsonb_build_object(
    'ok', true,
    'mensaje', format('%s de %s registrada en %s.', initcap(p_tipo), v_veh.placa, v_alm.nombre),
    'movimiento_id', v_mov.id,
    'registrado_en', v_mov.registrado_en,
    'distancia_m', round(v_dist::numeric, 1),
    'placa', v_veh.placa,
    'almacen', v_alm.nombre
  );
end;
$$;

-- Regenerar el QR de un vehículo (invalida el QR impreso anterior). Solo admin.
create or replace function public.regenerar_qr(p_vehiculo_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_token uuid;
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede regenerar códigos QR.' using errcode = '42501';
  end if;
  update vehiculos set qr_token = gen_random_uuid() where id = p_vehiculo_id returning qr_token into v_token;
  if v_token is null then raise exception 'Vehículo no encontrado.'; end if;
  return v_token;
end;
$$;

-- Cambiar rol / activar usuarios. Solo admin; no puede quitarse permisos a sí mismo.
create or replace function public.admin_actualizar_usuario(p_id uuid, p_rol text, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede gestionar usuarios.' using errcode = '42501';
  end if;
  if p_rol not in ('admin','operador') then
    raise exception 'Rol inválido.';
  end if;
  if p_id = auth.uid() and (p_rol <> 'admin' or not p_activo) then
    raise exception 'No puede quitarse el rol de administrador ni desactivarse a sí mismo.';
  end if;
  update perfiles set rol = p_rol, activo = p_activo where id = p_id;
  if not found then raise exception 'Usuario no encontrado.'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. VISTAS (respetan RLS gracias a security_invoker)
-- ---------------------------------------------------------------------

create or replace view public.v_movimientos with (security_invoker = true) as
select m.id, m.tipo, m.registrado_en, m.lat, m.lng, m.precision_m, m.distancia_m,
       m.direccion, m.observacion,
       m.vehiculo_id, v.placa, v.marca, v.modelo, v.estado as estado_vehiculo,
       m.almacen_id, a.nombre as almacen, a.radio_m,
       m.operador_id, p.nombre as operador, p.email as operador_email
from public.movimientos m
join public.vehiculos v on v.id = m.vehiculo_id
join public.almacenes a on a.id = m.almacen_id
left join public.perfiles p on p.id = m.operador_id;

-- RF10: último punto de control registrado por vehículo (no es GPS en tiempo real)
create or replace view public.v_ultimo_punto with (security_invoker = true) as
select distinct on (vehiculo_id) *
from public.v_movimientos
order by vehiculo_id, registrado_en desc, id desc;

create or replace view public.v_rechazos with (security_invoker = true) as
select r.id, r.creado_en, r.tipo, r.motivo, r.lat, r.lng, r.precision_m, r.distancia_m,
       v.placa, a.nombre as almacen, p.nombre as operador
from public.escaneos_rechazados r
left join public.vehiculos v on v.id = r.vehiculo_id
left join public.almacenes a on a.id = r.almacen_id
left join public.perfiles p on p.id = r.operador_id;

-- ---------------------------------------------------------------------
-- 6. SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------

alter table public.perfiles            enable row level security;
alter table public.vehiculos           enable row level security;
alter table public.almacenes           enable row level security;
alter table public.movimientos         enable row level security;
alter table public.escaneos_rechazados enable row level security;
alter table public.parametros          enable row level security;

-- Borrar políticas previas (para poder re-ejecutar el script)
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('perfiles','vehiculos','almacenes','movimientos','escaneos_rechazados','parametros')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- PERFILES: los usuarios activos ven todos los perfiles; cada usuario siempre ve el suyo
-- (para saber si fue desactivado). Cambios solo vía admin_actualizar_usuario().
create policy perfiles_leer on public.perfiles for select to authenticated using (es_activo() or id = auth.uid());

-- VEHÍCULOS: todos los activos leen; solo admin crea / edita / elimina.
create policy vehiculos_leer     on public.vehiculos for select to authenticated using (es_activo());
create policy vehiculos_crear    on public.vehiculos for insert to authenticated with check (es_admin());
create policy vehiculos_editar   on public.vehiculos for update to authenticated using (es_admin()) with check (es_admin());
create policy vehiculos_eliminar on public.vehiculos for delete to authenticated using (es_admin());

-- ALMACENES: igual que vehículos.
create policy almacenes_leer     on public.almacenes for select to authenticated using (es_activo());
create policy almacenes_crear    on public.almacenes for insert to authenticated with check (es_admin());
create policy almacenes_editar   on public.almacenes for update to authenticated using (es_admin()) with check (es_admin());
create policy almacenes_eliminar on public.almacenes for delete to authenticated using (es_admin());

-- MOVIMIENTOS: solo lectura. No hay política de insert/update/delete:
-- la única forma de crear un movimiento es registrar_movimiento().
create policy movimientos_leer on public.movimientos for select to authenticated using (es_activo());

-- RECHAZOS: solo el administrador los consulta.
create policy rechazos_leer on public.escaneos_rechazados for select to authenticated using (es_admin());

-- PARÁMETROS: todos leen, solo admin modifica.
create policy parametros_leer   on public.parametros for select to authenticated using (es_activo());
create policy parametros_editar on public.parametros for update to authenticated using (es_admin()) with check (es_admin());

-- Los visitantes sin sesión (anon) no tienen acceso a nada.
revoke all on public.perfiles, public.vehiculos, public.almacenes, public.movimientos,
              public.escaneos_rechazados, public.parametros,
              public.v_movimientos, public.v_ultimo_punto, public.v_rechazos from anon;

-- Los usuarios autenticados no pueden escribir movimientos/rechazos ni perfiles directamente.
revoke insert, update, delete on public.movimientos, public.escaneos_rechazados, public.perfiles from authenticated;
-- Ni cambiar a mano el token QR, el creador o la fecha de un vehículo.
revoke insert, update on public.vehiculos from authenticated;
grant  insert (placa, marca, modelo, anio, estado) on public.vehiculos to authenticated;
grant  update (placa, marca, modelo, anio, estado) on public.vehiculos to authenticated;

-- Funciones: solo usuarios autenticados.
revoke execute on function public.registrar_movimiento(uuid, uuid, text, double precision, double precision, double precision, text, text) from public, anon;
revoke execute on function public.regenerar_qr(uuid) from public, anon;
revoke execute on function public.admin_actualizar_usuario(uuid, text, boolean) from public, anon;
revoke execute on function public.crear_perfil() from public, anon, authenticated;
grant  execute on function public.registrar_movimiento(uuid, uuid, text, double precision, double precision, double precision, text, text) to authenticated;
grant  execute on function public.regenerar_qr(uuid) to authenticated;
grant  execute on function public.admin_actualizar_usuario(uuid, text, boolean) to authenticated;

-- Listo. Siguiente paso: crear el primer usuario y ejecutar 02_datos_demo.sql
