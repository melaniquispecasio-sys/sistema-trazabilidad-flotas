-- =====================================================================
--  Script 2/2: DATOS DE DEMOSTRACIÓN
--  Ejecutar DESPUÉS de 01_esquema_y_seguridad.sql y DESPUÉS de crear
--  el primer usuario (el administrador). Se puede re-ejecutar.
-- =====================================================================

-- Almacenes (coordenadas aproximadas; el admin puede ajustarlas desde la app)
insert into public.almacenes (nombre, direccion, lat, lng, radio_m) values
  ('Almacén Huancayo',      'Huancayo, Junín, Perú',           -12.065100, -75.204900, 300),
  ('Almacén Central Lima',  'Cercado de Lima, Lima, Perú',     -12.046400, -77.042800, 300),
  ('Almacén La Oroya',      'La Oroya, Yauli, Junín, Perú',    -11.519300, -75.899300, 250)
on conflict (nombre) do nothing;

-- Vehículos
insert into public.vehiculos (placa, marca, modelo, anio, estado) values
  ('ABC-123', 'Volvo',         'FH 460',      2020, 'disponible'),
  ('DEF-456', 'Scania',        'R450',        2019, 'disponible'),
  ('GHI-789', 'Mercedes-Benz', 'Actros 2645', 2021, 'disponible'),
  ('JKL-012', 'Hino',          '500 FM',      2018, 'mantenimiento')
on conflict (placa) do nothing;

-- Historial previo para que la demo cuente una historia:
-- el camión ABC-123 salió de Lima, pasó por La Oroya y ahora va a llegar a Huancayo.
-- (Solo se inserta si existe un administrador y aún no hay movimientos.)
do $$
declare
  v_admin uuid := (select id from public.perfiles where rol = 'admin' order by creado_en limit 1);
  v_abc uuid := (select id from public.vehiculos where placa = 'ABC-123');
  v_def uuid := (select id from public.vehiculos where placa = 'DEF-456');
  v_lim public.almacenes%rowtype;
  v_oro public.almacenes%rowtype;
  v_hyo public.almacenes%rowtype;
begin
  if v_admin is null then
    raise notice 'No hay administrador todavía: se omitió el historial de ejemplo. Cree su usuario y vuelva a ejecutar este script.';
    return;
  end if;
  if exists (select 1 from public.movimientos) then
    raise notice 'Ya existen movimientos: no se agregó historial de ejemplo.';
    return;
  end if;

  select * into v_lim from public.almacenes where nombre = 'Almacén Central Lima';
  select * into v_oro from public.almacenes where nombre = 'Almacén La Oroya';
  select * into v_hyo from public.almacenes where nombre = 'Almacén Huancayo';

  insert into public.movimientos (vehiculo_id, almacen_id, tipo, operador_id, registrado_en, lat, lng, precision_m, distancia_m, direccion, observacion) values
    (v_abc, v_lim.id, 'entrada', v_admin, now() - interval '2 days',            v_lim.lat + 0.0003, v_lim.lng, 12, 33, v_lim.direccion, 'Dato de ejemplo'),
    (v_abc, v_lim.id, 'salida',  v_admin, now() - interval '1 day 6 hours',     v_lim.lat, v_lim.lng + 0.0004, 15, 43, v_lim.direccion, 'Dato de ejemplo'),
    (v_abc, v_oro.id, 'entrada', v_admin, now() - interval '20 hours',          v_oro.lat, v_oro.lng, 18, 10, v_oro.direccion, 'Dato de ejemplo'),
    (v_abc, v_oro.id, 'salida',  v_admin, now() - interval '18 hours',          v_oro.lat + 0.0002, v_oro.lng, 20, 22, v_oro.direccion, 'Dato de ejemplo'),
    (v_def, v_hyo.id, 'entrada', v_admin, now() - interval '5 hours',           v_hyo.lat, v_hyo.lng - 0.0005, 9, 54, v_hyo.direccion, 'Dato de ejemplo');

  update public.vehiculos set estado = 'en_ruta'    where id = v_abc;
  update public.vehiculos set estado = 'disponible' where id = v_def;
end $$;
