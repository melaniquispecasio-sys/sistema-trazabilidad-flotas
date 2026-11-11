/* Historial de movimientos y auditoría de rechazos (RF09, RF11) */
(async function () {
  'use strict';
  const perfil = await App.iniciarPagina({ pagina: 'movimientos' });
  if (!perfil) return;
  const { $, $$, esc } = App;
  const POR_PAGINA = 25;
  let pagina = 0, total = 0, vista = 'movimientos', filasActuales = [];

  // Llenar listas de filtros
  const [veh, alm, ope] = await Promise.all([
    App.sb.from('vehiculos').select('id, placa').order('placa'),
    App.sb.from('almacenes').select('id, nombre').order('nombre'),
    App.sb.from('perfiles').select('id, nombre').order('nombre')
  ]);
  const opciones = (lista, k, t) => (lista || []).map((x) => `<option value="${x[k]}">${esc(x[t])}</option>`).join('');
  $('#f-vehiculo').insertAdjacentHTML('beforeend', opciones(veh.data, 'id', 'placa'));
  $('#f-almacen').insertAdjacentHTML('beforeend', opciones(alm.data, 'id', 'nombre'));
  $('#f-operador').insertAdjacentHTML('beforeend', opciones(ope.data, 'id', 'nombre'));

  // Filtro por vehículo desde la URL (?v=id)
  const vUrl = new URLSearchParams(location.search).get('v');
  if (vUrl) $('#f-vehiculo').value = vUrl;

  function construirConsulta(conConteo = true) {
    const desde = $('#f-desde').value, hasta = $('#f-hasta').value;
    if (vista === 'rechazos') {
      let q = App.sb.from('v_rechazos').select('*', conConteo ? { count: 'exact' } : undefined).order('creado_en', { ascending: false });
      if (desde) q = q.gte('creado_en', new Date(desde + 'T00:00:00').toISOString());
      if (hasta) q = q.lte('creado_en', new Date(hasta + 'T23:59:59.999').toISOString());
      return q;
    }
    let q = App.sb.from('v_movimientos').select('*', conConteo ? { count: 'exact' } : undefined).order('registrado_en', { ascending: false });
    if ($('#f-vehiculo').value) q = q.eq('vehiculo_id', $('#f-vehiculo').value);
    if ($('#f-almacen').value) q = q.eq('almacen_id', $('#f-almacen').value);
    if ($('#f-tipo').value) q = q.eq('tipo', $('#f-tipo').value);
    if ($('#f-operador').value) q = q.eq('operador_id', $('#f-operador').value);
    if (desde) q = q.gte('registrado_en', new Date(desde + 'T00:00:00').toISOString());
    if (hasta) q = q.lte('registrado_en', new Date(hasta + 'T23:59:59.999').toISOString());
    return q;
  }

  async function cargar() {
    const desdeFila = pagina * POR_PAGINA;
    const { data, error, count } = await construirConsulta().range(desdeFila, desdeFila + POR_PAGINA - 1);
    if (error) { App.toast(App.mensajeError(error), 'error'); return; }
    total = count || 0;
    filasActuales = data;
    pintar(data);
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    $('#pagina').textContent = `Página ${pagina + 1} de ${paginas}`;
    $('#total').textContent = `${total} registro(s)`;
    $('#btn-anterior').disabled = pagina === 0;
    $('#btn-siguiente').disabled = pagina + 1 >= paginas;
  }

  function pintar(data) {
    if (vista === 'rechazos') {
      $('#cabecera').innerHTML = '<tr><th>Fecha (servidor)</th><th>Placa</th><th>Tipo</th><th>Almacén</th><th>Operador</th><th>Motivo del rechazo</th><th>Distancia</th><th>Precisión</th></tr>';
      $('#tabla').innerHTML = data.length ? data.map((r) => `
        <tr>
          <td class="small">${esc(App.fecha(r.creado_en, true))}</td>
          <td class="mono">${esc(r.placa || '—')}</td>
          <td>${r.tipo ? App.badgeTipo(r.tipo) : '—'}</td>
          <td>${esc(r.almacen || '—')}</td>
          <td>${esc(r.operador || '—')}</td>
          <td class="small">${esc(r.motivo)}</td>
          <td>${App.metros(r.distancia_m)}</td>
          <td>${r.precision_m ? '±' + Math.round(r.precision_m) + ' m' : '—'}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="vacio">No hay intentos rechazados.</td></tr>';
      return;
    }
    $('#cabecera').innerHTML = '<tr><th>Fecha (servidor)</th><th>Placa</th><th>Tipo</th><th>Almacén</th><th>Operador</th><th>Dirección (Nominatim)</th><th>Distancia / precisión</th><th></th></tr>';
    $('#tabla').innerHTML = data.length ? data.map((m, i) => `
      <tr>
        <td class="small">${esc(App.fecha(m.registrado_en, true))}</td>
        <td><b class="mono">${esc(m.placa)}</b></td>
        <td>${App.badgeTipo(m.tipo)}</td>
        <td>${esc(m.almacen)}</td>
        <td>${esc(m.operador || '—')}</td>
        <td class="small">${esc(m.direccion || '—')}${m.observacion ? `<br><span class="muted">📝 ${esc(m.observacion)}</span>` : ''}</td>
        <td class="small">${App.metros(m.distancia_m)} / ±${Math.round(m.precision_m)} m</td>
        <td><button class="btn chico secundario" data-mapa="${i}">🗺️</button></td>
      </tr>`).join('') : '<tr><td colspan="8" class="vacio">No hay movimientos con esos filtros.</td></tr>';
  }

  function verEnMapa(m) {
    App.modal({
      titulo: `${m.placa} · ${App.TIPOS[m.tipo]} en ${m.almacen}`,
      ancho: true,
      html: `<p class="small muted">${esc(App.fecha(m.registrado_en, true))} · ${esc(m.operador || '')} · ${esc(m.direccion || '')}</p>
             <div id="mapa-mov" class="mapa"></div>`,
      alAbrir: async (el) => {
        const mapa = App.mapa.crear($('#mapa-mov', el), { centro: [m.lat, m.lng], zoom: 16 });
        setTimeout(() => mapa.invalidateSize(), 150);
        const { data: a } = await App.sb.from('almacenes').select('*').eq('id', m.almacen_id).maybeSingle();
        if (a) App.mapa.almacen(mapa, a);
        L.circle([m.lat, m.lng], { radius: m.precision_m, color: '#2563eb', weight: 1, fillOpacity: 0.1 }).addTo(mapa);
        L.marker([m.lat, m.lng], { icon: App.mapa.icono('🚚', m.tipo === 'entrada' ? '#16a34a' : '#d9731a', 30) })
          .addTo(mapa).bindPopup(`Punto de control registrado<br>Distancia al almacén: ${App.metros(m.distancia_m)}`).openPopup();
        if (a) mapa.fitBounds([[m.lat, m.lng], [a.lat, a.lng]], { padding: [60, 60], maxZoom: 17 });
      }
    });
  }

  async function exportar() {
    const { data, error } = await construirConsulta(false).limit(5000);
    if (error) return App.toast(App.mensajeError(error), 'error');
    if (!data.length) return App.toast('No hay datos para exportar.', 'error');
    const hoy = new Date().toISOString().slice(0, 10);
    if (vista === 'rechazos') {
      App.descargarCSV(`rechazos_${hoy}.csv`, data, [
        { t: 'Fecha', v: (r) => App.fecha(r.creado_en, true) }, { t: 'Placa', k: 'placa' }, { t: 'Tipo', k: 'tipo' },
        { t: 'Almacén', k: 'almacen' }, { t: 'Operador', k: 'operador' }, { t: 'Motivo', k: 'motivo' },
        { t: 'Distancia (m)', v: (r) => r.distancia_m == null ? '' : Math.round(r.distancia_m) },
        { t: 'Precisión (m)', v: (r) => r.precision_m == null ? '' : Math.round(r.precision_m) },
        { t: 'Latitud', k: 'lat' }, { t: 'Longitud', k: 'lng' }
      ]);
    } else {
      App.descargarCSV(`movimientos_${hoy}.csv`, data, [
        { t: 'Fecha (servidor)', v: (m) => App.fecha(m.registrado_en, true) }, { t: 'Placa', k: 'placa' },
        { t: 'Tipo', k: 'tipo' }, { t: 'Almacén', k: 'almacen' }, { t: 'Operador', k: 'operador' },
        { t: 'Dirección', k: 'direccion' }, { t: 'Latitud', k: 'lat' }, { t: 'Longitud', k: 'lng' },
        { t: 'Precisión (m)', v: (m) => Math.round(m.precision_m) }, { t: 'Distancia (m)', v: (m) => Math.round(m.distancia_m) },
        { t: 'Observación', k: 'observacion' }
      ]);
    }
  }

  /* ---------- Eventos ---------- */
  $('#filtros').addEventListener('submit', (e) => { e.preventDefault(); pagina = 0; cargar(); });
  $('#btn-limpiar').addEventListener('click', () => {
    $('#filtros').reset();
    history.replaceState(null, '', location.pathname);
    pagina = 0; cargar();
  });
  $('#btn-csv').addEventListener('click', (e) => App.cargando(e.currentTarget, 'Exportando...', exportar));
  $('#btn-anterior').addEventListener('click', () => { if (pagina > 0) { pagina--; cargar(); } });
  $('#btn-siguiente').addEventListener('click', () => { pagina++; cargar(); });
  $('#tabla').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mapa]');
    if (b) verEnMapa(filasActuales[Number(b.dataset.mapa)]);
  });
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('activo', x === b));
    vista = b.dataset.vista;
    $('#titulo-tabla').textContent = vista === 'rechazos' ? 'Intentos rechazados (auditoría)' : 'Movimientos';
    $$('.solo-mov').forEach((el) => el.classList.toggle('oculto', vista === 'rechazos'));
    pagina = 0; cargar();
  }));

  await cargar();
})();
