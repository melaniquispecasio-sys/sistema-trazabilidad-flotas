/* Dashboard (RF10 trazabilidad + RF11 consultas) */
(async function () {
  'use strict';
  const perfil = await App.iniciarPagina({ pagina: 'dashboard' });
  if (!perfil) return;
  const { $, esc } = App;

  const mapa = App.mapa.crear('mapa');
  const capa = L.layerGroup().addTo(mapa);
  let filas = [];

  async function cargar() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const desde = hoy.toISOString();

    const [veh, alm, ult, rec, nHoy, nRech] = await Promise.all([
      App.sb.from('vehiculos').select('id, placa, marca, modelo, anio, estado').order('placa'),
      App.sb.from('almacenes').select('*').order('nombre'),
      App.sb.from('v_ultimo_punto').select('*'),
      App.sb.from('v_movimientos').select('*').order('registrado_en', { ascending: false }).limit(8),
      App.sb.from('movimientos').select('id', { count: 'exact', head: true }).gte('registrado_en', desde),
      App.esAdmin
        ? App.sb.from('escaneos_rechazados').select('id', { count: 'exact', head: true }).gte('creado_en', desde)
        : Promise.resolve({ count: null })
    ]);
    const error = [veh, alm, ult, rec, nHoy, nRech].find((r) => r.error);
    if (error) { App.toast(App.mensajeError(error.error), 'error'); return; }

    const vehiculos = veh.data, almacenes = alm.data, ultimos = ult.data;
    const cuenta = (e) => vehiculos.filter((v) => v.estado === e).length;

    $('#k-vehiculos').textContent = vehiculos.length;
    $('#k-ruta').textContent = cuenta('en_ruta');
    $('#k-disponibles').textContent = cuenta('disponible');
    $('#k-fuera').textContent = cuenta('mantenimiento') + cuenta('inactivo');
    $('#k-almacenes').textContent = almacenes.filter((a) => a.activo).length;
    $('#k-hoy').textContent = nHoy.count ?? 0;
    $('#k-rechazos').textContent = nRech.count ?? '–';

    // Mapa: almacenes + último punto de control
    capa.clearLayers();
    const limites = [];
    almacenes.forEach((a) => {
      const { circulo, marcador } = App.mapa.almacen(mapa, a);
      capa.addLayer(circulo); capa.addLayer(marcador);
      limites.push([a.lat, a.lng]);
    });
    ultimos.forEach((u) => {
      const color = u.tipo === 'entrada' ? '#16a34a' : '#d9731a';
      L.marker([u.lat, u.lng], { icon: App.mapa.icono('🚚', color, 30), zIndexOffset: 500 })
        .bindPopup(`<b>${esc(u.placa)}</b> · ${esc(App.TIPOS[u.tipo])}<br>${esc(u.almacen)}<br>
          ${esc(App.fecha(u.registrado_en))}<br><span style="color:#5b6676">${esc(u.direccion || '')}</span><br>
          <a href="trazabilidad.html?v=${u.vehiculo_id}">Ver trazabilidad →</a>`)
        .addTo(capa);
      limites.push([u.lat, u.lng]);
    });
    if (limites.length) mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 13 });

    // Movimientos recientes
    $('#recientes').innerHTML = rec.data.length ? rec.data.map((m, i) => `
      <li class="${m.tipo} ${i === 0 ? 'ultimo' : ''}">
        <b>${esc(m.placa)}</b> ${App.badgeTipo(m.tipo)}<br>
        <span>${esc(m.almacen)}</span><br>
        <span class="small muted">${esc(App.fecha(m.registrado_en))} · ${esc(m.operador || '')}</span>
      </li>`).join('') : '<li class="muted">Aún no hay movimientos.</li>';

    // Tabla de flota
    const porVehiculo = Object.fromEntries(ultimos.map((u) => [u.vehiculo_id, u]));
    filas = vehiculos.map((v) => ({ ...v, ultimo: porVehiculo[v.id] }));
    pintarTabla();
  }

  function pintarTabla() {
    const q = $('#buscar').value.trim().toUpperCase();
    const lista = filas.filter((f) => !q || f.placa.includes(q));
    $('#tabla-flota').innerHTML = lista.length ? lista.map((f) => `
      <tr>
        <td><b class="mono">${esc(f.placa)}</b></td>
        <td>${esc(f.marca)} ${esc(f.modelo)} <span class="muted small">(${f.anio})</span></td>
        <td>${App.badgeEstado(f.estado)}</td>
        <td>${f.ultimo ? esc(f.ultimo.almacen) + '<br><span class="small muted">' + esc(f.ultimo.direccion || '') + '</span>' : '<span class="muted">Sin registros</span>'}</td>
        <td>${f.ultimo ? App.badgeTipo(f.ultimo.tipo) : ''}</td>
        <td>${f.ultimo ? esc(App.fecha(f.ultimo.registrado_en)) + '<br><span class="small muted">' + App.haceCuanto(f.ultimo.registrado_en) + '</span>' : ''}</td>
        <td><a class="btn chico secundario" href="trazabilidad.html?v=${f.id}">Ver ruta</a></td>
      </tr>`).join('') : '<tr><td colspan="7" class="vacio">No hay vehículos.</td></tr>';
  }

  $('#buscar').addEventListener('input', pintarTabla);
  $('#btn-actualizar').addEventListener('click', (e) => App.cargando(e.currentTarget, 'Actualizando...', cargar));
  await cargar();
})();
