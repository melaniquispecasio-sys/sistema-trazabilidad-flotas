/* Trazabilidad: último punto de control y secuencia histórica (RF10) */
(async function () {
  'use strict';
  const perfil = await App.iniciarPagina({ pagina: 'trazabilidad' });
  if (!perfil) return;
  const { $, esc } = App;
  let mapa = null, capa = null;

  const [veh, alm] = await Promise.all([
    App.sb.from('vehiculos').select('*').order('placa'),
    App.sb.from('almacenes').select('*')
  ]);
  if (veh.error) return App.toast(App.mensajeError(veh.error), 'error');
  const vehiculos = veh.data, almacenes = alm.data || [];
  $('#sel-vehiculo').insertAdjacentHTML('beforeend',
    vehiculos.map((v) => `<option value="${v.id}">${esc(v.placa)} — ${esc(v.marca)} ${esc(v.modelo)}</option>`).join(''));

  async function mostrar(id) {
    if (!id) { $('#contenido').classList.add('oculto'); $('#vacio').classList.remove('oculto'); return; }
    history.replaceState(null, '', '?v=' + id);
    const v = vehiculos.find((x) => x.id === id);
    if (!v) return;
    const { data: movs, error } = await App.sb.from('v_movimientos').select('*')
      .eq('vehiculo_id', id).order('registrado_en', { ascending: false }).limit(50);
    if (error) return App.toast(App.mensajeError(error), 'error');

    $('#vacio').classList.add('oculto');
    $('#contenido').classList.remove('oculto');
    $('#link-movs').href = 'movimientos.html?v=' + id;
    const u = movs[0];

    $('#resumen').innerHTML = `
      <div class="dato-grid">
        <div class="dato"><div class="k">Placa</div><div class="v mono" style="font-size:1.3rem">${esc(v.placa)}</div></div>
        <div class="dato"><div class="k">Vehículo</div><div class="v">${esc(v.marca)} ${esc(v.modelo)} (${v.anio})</div></div>
        <div class="dato"><div class="k">Estado</div><div class="v">${App.badgeEstado(v.estado)}</div></div>
        <div class="dato"><div class="k">Último punto de control</div><div class="v">${u
          ? `${App.badgeTipo(u.tipo)} ${esc(u.almacen)}` : '<span class="muted">Sin registros</span>'}</div></div>
        <div class="dato"><div class="k">Fecha (servidor)</div><div class="v">${u ? esc(App.fecha(u.registrado_en, true)) + `<div class="small muted">${App.haceCuanto(u.registrado_en)}</div>` : '—'}</div></div>
        <div class="dato"><div class="k">Registrado por</div><div class="v">${u ? esc(u.operador || '—') : '—'}</div></div>
        <div class="dato" style="grid-column:1/-1"><div class="k">Dirección del último punto</div><div class="v">${u ? esc(u.direccion || '—') : '—'}</div></div>
      </div>`;

    $('#linea').innerHTML = movs.length ? movs.map((m, i) => `
      <li class="${m.tipo} ${i === 0 ? 'ultimo' : ''}">
        ${App.badgeTipo(m.tipo)} <b>${esc(m.almacen)}</b> ${i === 0 ? App.badge('advertencia', 'Último') : ''}<br>
        <span class="small">${esc(App.fecha(m.registrado_en, true))}</span><br>
        <span class="small muted">${esc(m.operador || '')} · ${esc(m.direccion || '')}</span>
      </li>`).join('') : '<li class="muted">Este vehículo aún no tiene movimientos.</li>';

    // Mapa
    if (!mapa) { mapa = App.mapa.crear('mapa'); capa = L.layerGroup().addTo(mapa); }
    setTimeout(() => mapa.invalidateSize(), 100);
    capa.clearLayers();
    const usados = new Set(movs.map((m) => m.almacen_id));
    almacenes.filter((a) => usados.has(a.id)).forEach((a) => {
      const { circulo, marcador } = App.mapa.almacen(mapa, a);
      capa.addLayer(circulo); capa.addLayer(marcador);
    });
    const cronologico = [...movs].reverse();
    if (cronologico.length > 1) {
      L.polyline(cronologico.map((m) => [m.lat, m.lng]), { color: '#1b4380', weight: 3, dashArray: '8 8' }).addTo(capa);
    }
    cronologico.forEach((m, i) => {
      const ultimo = i === cronologico.length - 1;
      L.marker([m.lat, m.lng], {
        icon: ultimo ? App.mapa.icono('🚚', '#dc2626', 36)
          : L.divIcon({ className: '', html: `<div style="background:${m.tipo === 'entrada' ? '#16a34a' : '#d9731a'};color:#fff;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: ultimo ? 1000 : 0
      }).bindPopup(`<b>${i + 1}. ${esc(App.TIPOS[m.tipo])}</b> · ${esc(m.almacen)}<br>${esc(App.fecha(m.registrado_en))}<br>${esc(m.operador || '')}${ultimo ? '<br><b>Último punto de control</b>' : ''}`)
        .addTo(capa);
    });
    const puntos = movs.map((m) => [m.lat, m.lng]);
    if (puntos.length) mapa.fitBounds(puntos, { padding: [50, 50], maxZoom: 15 });
    else mapa.setView([-12.0464, -75.2], 6);
  }

  $('#sel-vehiculo').addEventListener('change', (e) => mostrar(e.target.value));
  const inicial = new URLSearchParams(location.search).get('v');
  if (inicial && vehiculos.some((v) => v.id === inicial)) {
    $('#sel-vehiculo').value = inicial;
    mostrar(inicial);
  }
})();
