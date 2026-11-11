/* Almacenes: CRUD con mapa y geocerca (RF04) + parámetros de validación */
(async function () {
  'use strict';
  const perfil = await App.iniciarPagina({ pagina: 'almacenes' });
  if (!perfil) return;
  const { $, esc } = App;
  let almacenes = [];

  const mapa = App.mapa.crear('mapa');
  const capa = L.layerGroup().addTo(mapa);

  async function cargar() {
    const { data, error } = await App.sb.from('almacenes').select('*').order('nombre');
    if (error) { App.toast(App.mensajeError(error), 'error'); return; }
    almacenes = data;
    pintar();
  }

  function pintar() {
    const q = $('#f-buscar').value.trim().toLowerCase();
    const lista = almacenes.filter((a) => !q || `${a.nombre} ${a.direccion}`.toLowerCase().includes(q));
    $('#tabla').innerHTML = lista.length ? lista.map((a) => `
      <tr>
        <td><b>${esc(a.nombre)}</b></td>
        <td>${esc(a.direccion)}</td>
        <td class="mono small">${a.lat.toFixed(6)}, ${a.lng.toFixed(6)}</td>
        <td>${a.radio_m} m</td>
        <td>${a.activo ? App.badge('activo', 'Activo') : App.badge('inactivo', 'Inactivo')}</td>
        <td><div class="acciones">
          <button class="btn chico secundario" data-ver="${a.id}">🗺️ Ver</button>
          ${App.esAdmin ? `<button class="btn chico secundario" data-editar="${a.id}">✏️ Editar</button>
          <button class="btn chico peligro" data-eliminar="${a.id}">🗑️</button>` : ''}
        </div></td>
      </tr>`).join('') : '<tr><td colspan="6" class="vacio">No hay almacenes.</td></tr>';

    capa.clearLayers();
    almacenes.forEach((a) => {
      const { circulo, marcador } = App.mapa.almacen(mapa, a);
      capa.addLayer(circulo); capa.addLayer(marcador);
    });
    if (almacenes.length) mapa.fitBounds(almacenes.map((a) => [a.lat, a.lng]), { padding: [40, 40], maxZoom: 14 });
  }

  /* ---------- Formulario con mapa ---------- */
  function abrirFormulario(a = null) {
    let mapaForm, marcador, circulo;
    App.modal({
      titulo: a ? `Editar ${a.nombre}` : 'Nuevo almacén',
      ancho: true,
      html: `
        <form id="form-alm" class="form-grid" novalidate>
          <div class="completo"><label for="nombre">Nombre *</label>
            <input id="nombre" required maxlength="80" value="${esc(a?.nombre || '')}" placeholder="Almacén Huancayo"></div>
          <div class="completo">
            <label for="buscar-dir">Buscar ubicación (Nominatim)</label>
            <div style="display:flex;gap:.4rem">
              <input id="buscar-dir" placeholder="Ej.: Av. Ferrocarril, Huancayo">
              <button type="button" class="btn secundario" id="btn-buscar">🔎</button>
            </div>
            <div id="resultados" class="small"></div>
          </div>
          <div class="completo">
            <div class="acciones" style="margin-bottom:.5rem">
              <button type="button" class="btn chico secundario" id="btn-mi-ubicacion">📍 Usar mi ubicación actual</button>
              <span class="muted small" style="align-self:center">o haga clic en el mapa / arrastre el marcador</span>
            </div>
            <div id="mapa-form" class="mapa chico"></div>
          </div>
          <div><label for="lat">Latitud *</label><input id="lat" type="number" step="any" required value="${a?.lat ?? ''}"></div>
          <div><label for="lng">Longitud *</label><input id="lng" type="number" step="any" required value="${a?.lng ?? ''}"></div>
          <div class="completo"><label for="direccion">Dirección *</label>
            <div style="display:flex;gap:.4rem">
              <input id="direccion" required value="${esc(a?.direccion || '')}">
              <button type="button" class="btn secundario" id="btn-dir" title="Obtener dirección desde las coordenadas">↺</button>
            </div></div>
          <div><label for="radio">Radio permitido (m) *</label>
            <input id="radio" type="number" min="20" max="5000" required value="${a?.radio_m ?? 200}">
            <div class="ayuda">Entre 20 y 5000 m.</div></div>
          <div><label>&nbsp;</label><label class="checkbox"><input type="checkbox" id="activo" ${a?.activo === false ? '' : 'checked'}> Almacén activo</label></div>
          <div class="completo" id="form-error"></div>
        </form>`,
      botones: [
        { texto: 'Cancelar', clase: 'secundario' },
        { texto: a ? 'Guardar cambios' : 'Registrar almacén', clase: 'naranja', accion: (cerrar, btn) => guardar(a, cerrar, btn) }
      ],
      alAbrir: (el) => {
        const centro = a ? [a.lat, a.lng] : [-12.0651, -75.2049];
        mapaForm = App.mapa.crear($('#mapa-form', el), { centro, zoom: a ? 16 : 6 });
        setTimeout(() => mapaForm.invalidateSize(), 150);

        const actualizar = (lat, lng, mover = true) => {
          $('#lat').value = lat.toFixed(6);
          $('#lng').value = lng.toFixed(6);
          const radio = Number($('#radio').value) || 200;
          if (!marcador) {
            marcador = L.marker([lat, lng], { draggable: true, icon: App.mapa.icono('🏭', '#f28c28') }).addTo(mapaForm);
            circulo = L.circle([lat, lng], { radius: radio, color: '#f28c28', fillOpacity: 0.15 }).addTo(mapaForm);
            marcador.on('dragend', () => { const p = marcador.getLatLng(); actualizar(p.lat, p.lng, false); completarDireccion(true); });
          } else {
            marcador.setLatLng([lat, lng]); circulo.setLatLng([lat, lng]);
          }
          if (mover) mapaForm.setView([lat, lng], Math.max(mapaForm.getZoom(), 16));
        };
        const completarDireccion = async (forzar = false) => {
          const lat = Number($('#lat').value), lng = Number($('#lng').value);
          if (!$('#lat').value || !$('#lng').value) return;
          if (!forzar && $('#direccion').value.trim()) return;
          $('#direccion').value = 'Buscando dirección...';
          try { $('#direccion').value = (await App.geo.direccion(lat, lng)).corto; }
          catch (e) { $('#direccion').value = ''; App.toast(e.message, 'error'); }
        };

        if (a) actualizar(a.lat, a.lng);
        mapaForm.on('click', (e) => { actualizar(e.latlng.lat, e.latlng.lng, false); completarDireccion(true); });
        $('#radio').addEventListener('input', () => circulo && circulo.setRadius(Number($('#radio').value) || 0));
        ['#lat', '#lng'].forEach((s) => $(s).addEventListener('change', () => {
          const lat = Number($('#lat').value), lng = Number($('#lng').value);
          if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) actualizar(lat, lng);
        }));
        $('#btn-dir').addEventListener('click', () => completarDireccion(true));

        $('#btn-mi-ubicacion').addEventListener('click', (e) => App.cargando(e.currentTarget, 'Obteniendo GPS...', async () => {
          try {
            const p = await App.geo.obtenerUbicacion({ esperaMaxMs: 12000 });
            actualizar(p.lat, p.lng);
            App.toast(`Ubicación obtenida (precisión ±${Math.round(p.precision)} m).`, 'ok');
            await completarDireccion(true);
          } catch (err) { App.toast(err.message, 'error', 7000); }
        }));

        const buscar = () => App.cargando($('#btn-buscar'), '', async () => {
          const res = $('#resultados');
          try {
            const lista = await App.geo.buscar($('#buscar-dir').value);
            if (!lista.length) { res.innerHTML = '<div class="muted">Sin resultados.</div>'; return; }
            res.innerHTML = lista.map((r, i) => `<div><a href="#" data-i="${i}">📌 ${esc(r.texto)}</a></div>`).join('');
            res.onclick = (ev) => {
              const link = ev.target.closest('a'); if (!link) return;
              ev.preventDefault();
              const r = lista[Number(link.dataset.i)];
              actualizar(r.lat, r.lng);
              $('#direccion').value = r.texto.split(',').slice(0, 4).join(',');
              res.innerHTML = '';
            };
          } catch (err) { res.innerHTML = `<div class="aviso error">${esc(err.message)}</div>`; }
        });
        $('#btn-buscar').addEventListener('click', buscar);
        $('#buscar-dir').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
        $('#nombre').focus();
      }
    });
  }

  async function guardar(a, cerrar, btn) {
    const datos = {
      nombre: $('#nombre').value.trim(),
      direccion: $('#direccion').value.trim(),
      lat: Number($('#lat').value),
      lng: Number($('#lng').value),
      radio_m: parseInt($('#radio').value, 10),
      activo: $('#activo').checked
    };
    const errores = [];
    if (datos.nombre.length < 3) errores.push('El nombre debe tener al menos 3 caracteres.');
    if (!$('#lat').value || !$('#lng').value || !(datos.lat >= -90 && datos.lat <= 90) || !(datos.lng >= -180 && datos.lng <= 180))
      errores.push('Indique la ubicación (clic en el mapa, búsqueda o "Usar mi ubicación").');
    if (datos.direccion.length < 3 || datos.direccion === 'Buscando dirección...') errores.push('Ingrese la dirección.');
    if (!(datos.radio_m >= 20 && datos.radio_m <= 5000)) errores.push('El radio debe estar entre 20 y 5000 m.');
    if (errores.length) { $('#form-error').innerHTML = `<div class="aviso error">${errores.map(esc).join('<br>')}</div>`; return; }

    await App.cargando(btn, 'Guardando...', async () => {
      const { error } = a
        ? await App.sb.from('almacenes').update(datos).eq('id', a.id)
        : await App.sb.from('almacenes').insert(datos);
      if (error) { $('#form-error').innerHTML = `<div class="aviso error">${esc(App.mensajeError(error))}</div>`; return; }
      cerrar();
      App.toast(a ? 'Almacén actualizado.' : 'Almacén registrado.', 'ok');
      cargar();
    });
  }

  async function eliminar(a) {
    const ok = await App.confirmar(`¿Eliminar ${a.nombre}? Si tiene movimientos no se podrá eliminar (desactívelo en su lugar).`,
      { titulo: 'Eliminar almacén', textoOk: 'Eliminar', peligro: true });
    if (!ok) return;
    const { error } = await App.sb.from('almacenes').delete().eq('id', a.id);
    if (error) return App.toast(App.mensajeError(error), 'error', 7000);
    App.toast('Almacén eliminado.', 'ok');
    cargar();
  }

  /* ---------- Parámetros (solo admin) ---------- */
  async function cargarParametros() {
    if (!App.esAdmin) return;
    const { data, error } = await App.sb.from('parametros').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return;
    $('#p-precision').value = data.precision_max_m;
    $('#p-intervalo').value = data.intervalo_minimo_seg;
  }
  $('#form-param').addEventListener('submit', async (e) => {
    e.preventDefault();
    await App.cargando(e.submitter || $('#form-param button'), 'Guardando...', async () => {
      const { error } = await App.sb.from('parametros').update({
        precision_max_m: parseInt($('#p-precision').value, 10),
        intervalo_minimo_seg: parseInt($('#p-intervalo').value, 10)
      }).eq('id', 1);
      if (error) return App.toast(App.mensajeError(error), 'error');
      App.toast('Parámetros guardados.', 'ok');
    });
  });

  /* ---------- Eventos ---------- */
  $('#f-buscar').addEventListener('input', pintar);
  $('#btn-nuevo').addEventListener('click', () => abrirFormulario());
  $('#tabla').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const buscar = (id) => almacenes.find((x) => x.id === id);
    if (b.dataset.ver) {
      const a = buscar(b.dataset.ver);
      mapa.setView([a.lat, a.lng], 16);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (b.dataset.editar) abrirFormulario(buscar(b.dataset.editar));
    if (b.dataset.eliminar) eliminar(buscar(b.dataset.eliminar));
  });

  await Promise.all([cargar(), cargarParametros()]);
})();
