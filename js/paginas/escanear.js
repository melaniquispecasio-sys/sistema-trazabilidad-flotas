/* Escaneo (RF05) + GPS (RF06) + Dirección (RF07) + Geocerca (RF08) + Registro (RF09) */
(async function () {
  'use strict';
  const perfil = await App.iniciarPagina({ pagina: 'escanear' });
  if (!perfil) return;
  const { $, esc } = App;

  const estado = {
    vehiculo: null, ultimo: null, ubicacion: null, direccion: null,
    almacenes: [], almacen: null, parametros: { precision_max_m: 100, intervalo_minimo_seg: 60 }
  };
  let lector = null, camaraActiva = false, mapa = null, capaMapa = null, enviando = false;

  /* ---------- Datos base ---------- */
  const [alm, par] = await Promise.all([
    App.sb.from('almacenes').select('*').eq('activo', true).order('nombre'),
    App.sb.from('parametros').select('*').eq('id', 1).maybeSingle()
  ]);
  if (alm.error) App.toast(App.mensajeError(alm.error), 'error');
  estado.almacenes = alm.data || [];
  if (par.data) estado.parametros = par.data;
  if (!estado.almacenes.length) {
    $('#paso-1 .paso-cuerpo').insertAdjacentHTML('afterbegin',
      '<div class="aviso error">No hay almacenes activos. Un administrador debe registrar al menos uno.</div>');
  }

  /* ---------- Control de pasos ---------- */
  function irAPaso(n) {
    [1, 2, 3].forEach((i) => {
      const p = $('#paso-' + i);
      p.classList.toggle('actual', i === n);
      p.classList.toggle('hecho', i < n);
      p.classList.toggle('bloqueado', i > n);
    });
    $('#paso-4').classList.toggle('oculto', n !== 4);
    if (n === 4) $('#paso-4').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* =========================================================
     PASO 1 · Escaneo del QR (html5-qrcode)
     ========================================================= */
  function crearLector() {
    if (!lector) {
      lector = new Html5Qrcode('lector', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false
      });
    }
    return lector;
  }

  async function activarCamara() {
    if (!window.isSecureContext) {
      return App.toast('La cámara solo funciona con HTTPS (GitHub Pages) o en localhost.', 'error', 7000);
    }
    try {
      await crearLector().start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } },
        (texto) => procesarQR(texto),
        () => { /* ignorar fotogramas sin QR */ }
      );
      camaraActiva = true;
      $('#btn-camara').classList.add('oculto');
      $('#btn-detener').classList.remove('oculto');
    } catch (err) {
      const nombre = err?.name || String(err);
      let msg = 'No se pudo abrir la cámara: ' + (err?.message || err);
      if (/NotAllowed|Permission/i.test(nombre + err)) msg = 'Permiso de cámara denegado. Toque el candado 🔒 de la barra de direcciones y permita "Cámara".';
      if (/NotFound|Requested device not found/i.test(nombre + err)) msg = 'No se encontró una cámara. Use la opción "Desde imagen".';
      App.toast(msg, 'error', 8000);
    }
  }

  async function detenerCamara() {
    if (lector && camaraActiva) {
      try { await lector.stop(); lector.clear(); } catch (e) { /* ya detenida */ }
    }
    camaraActiva = false;
    $('#btn-camara').classList.remove('oculto');
    $('#btn-detener').classList.add('oculto');
  }

  let procesando = false;
  async function procesarQR(texto) {
    if (procesando) return;
    procesando = true;
    try {
      await detenerCamara();
      if (navigator.vibrate) navigator.vibrate(120);
      const token = App.qr.leer(texto);
      if (!token) {
        App.toast('Ese código QR no pertenece a este sistema.', 'error', 6000);
        return;
      }
      const { data: veh, error } = await App.sb.from('vehiculos').select('*').eq('qr_token', token).maybeSingle();
      if (error) { App.toast(App.mensajeError(error), 'error'); return; }
      if (!veh) {
        App.toast('QR no reconocido: no corresponde a ningún vehículo (pudo haber sido regenerado).', 'error', 7000);
        return;
      }
      const { data: ult } = await App.sb.from('v_ultimo_punto').select('*').eq('vehiculo_id', veh.id).maybeSingle();
      estado.vehiculo = veh;
      estado.ultimo = ult || null;
      mostrarVehiculo();
      irAPaso(2);
      obtenerGPS(); // inicia automáticamente el paso 2
    } finally {
      procesando = false;
    }
  }

  function mostrarVehiculo() {
    const v = estado.vehiculo, u = estado.ultimo;
    const bloqueado = ['mantenimiento', 'inactivo'].includes(v.estado);
    $('#zona-escaner').classList.add('oculto');
    $('#info-vehiculo').classList.remove('oculto');
    $('#info-vehiculo').innerHTML = `
      <div class="dato-grid">
        <div class="dato"><div class="k">Placa</div><div class="v mono" style="font-size:1.3rem">${esc(v.placa)}</div></div>
        <div class="dato"><div class="k">Vehículo</div><div class="v">${esc(v.marca)} ${esc(v.modelo)} (${v.anio})</div></div>
        <div class="dato"><div class="k">Estado</div><div class="v">${App.badgeEstado(v.estado)}</div></div>
        <div class="dato"><div class="k">Último punto de control</div><div class="v">${u
          ? `${App.badgeTipo(u.tipo)} ${esc(u.almacen)}<br><span class="small muted">${esc(App.fecha(u.registrado_en))}</span>`
          : '<span class="muted">Sin registros</span>'}</div></div>
      </div>
      ${bloqueado ? `<div class="aviso error">Este vehículo está en <b>${esc(App.ESTADOS[v.estado])}</b>: el servidor rechazará el registro.</div>` : ''}
      <button class="btn chico secundario" id="btn-otro" style="margin-top:.6rem">↺ Escanear otro vehículo</button>`;
    $('#btn-otro').onclick = reiniciar;
  }

  /* =========================================================
     PASO 2 · GPS (Geolocation API) + dirección (Nominatim)
     ========================================================= */
  async function obtenerGPS() {
    const btn = $('#btn-gps');
    btn.disabled = true;
    $('#estado-gps').textContent = 'Solicitando ubicación... (acepte el permiso si se lo pide)';
    try {
      const ubic = await App.geo.obtenerUbicacion({
        esperaMaxMs: 15000,
        precisionObjetivo: Math.min(20, estado.parametros.precision_max_m),
        alLeer: (p) => { $('#estado-gps').textContent = `Mejorando precisión... ±${Math.round(p.precision)} m`; }
      });
      estado.ubicacion = ubic;
      estado.direccion = null;
      $('#estado-gps').textContent = `Lectura obtenida ${ubic.fecha.toLocaleTimeString('es-PE')}`;
      btn.textContent = '🔄 Volver a medir';
      pintarGPS();
      prepararPaso3();
      irAPaso(3);
      // Dirección aproximada (no bloquea el registro si Nominatim falla)
      try {
        estado.direccion = await App.geo.direccion(ubic.lat, ubic.lng);
      } catch (e) {
        estado.direccion = { texto: '', corto: '' };
        App.toast('No se pudo obtener la dirección: ' + e.message, 'error');
      }
      pintarGPS();
    } catch (err) {
      $('#estado-gps').textContent = '';
      $('#datos-gps').innerHTML = `<div class="aviso error" style="grid-column:1/-1">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  function pintarGPS() {
    const u = estado.ubicacion; if (!u) return;
    const precisionOk = u.precision <= estado.parametros.precision_max_m;
    const dir = estado.direccion;
    $('#datos-gps').innerHTML = `
      <div class="dato"><div class="k">Latitud</div><div class="v mono">${u.lat.toFixed(6)}</div></div>
      <div class="dato"><div class="k">Longitud</div><div class="v mono">${u.lng.toFixed(6)}</div></div>
      <div class="dato"><div class="k">Precisión</div><div class="v">±${Math.round(u.precision)} m
        ${precisionOk ? App.badge('ok', 'Aceptable') : App.badge('error', `Máx. ${estado.parametros.precision_max_m} m`)}</div></div>
      <div class="dato" style="grid-column:1/-1"><div class="k">Dirección aproximada (Nominatim)</div>
        <div class="v">${dir ? esc(dir.corto || 'No disponible') : '<span class="muted">Consultando...</span>'}</div>
        ${dir?.texto && dir.texto !== dir.corto ? `<div class="small muted">${esc(dir.texto)}</div>` : ''}</div>`;
    pintarMapa();
  }

  function pintarMapa() {
    const u = estado.ubicacion; if (!u) return;
    $('#mapa').classList.remove('oculto');
    if (!mapa) {
      mapa = App.mapa.crear('mapa', { centro: [u.lat, u.lng], zoom: 16 });
      capaMapa = L.layerGroup().addTo(mapa);
    }
    setTimeout(() => mapa.invalidateSize(), 100);
    capaMapa.clearLayers();
    estado.almacenes.forEach((a) => {
      const { circulo, marcador } = App.mapa.almacen(mapa, a);
      capaMapa.addLayer(circulo); capaMapa.addLayer(marcador);
    });
    L.circle([u.lat, u.lng], { radius: u.precision, color: '#2563eb', weight: 1, fillOpacity: 0.1 }).addTo(capaMapa);
    L.marker([u.lat, u.lng], { icon: App.mapa.puntoUsuario(), zIndexOffset: 1000 }).bindPopup('Usted está aquí').addTo(capaMapa);
    const puntos = [[u.lat, u.lng]];
    if (estado.almacen) puntos.push([estado.almacen.lat, estado.almacen.lng]);
    if (estado.almacen && App.geo.distancia(u.lat, u.lng, estado.almacen.lat, estado.almacen.lng) < 20000) {
      mapa.fitBounds(puntos, { padding: [40, 40], maxZoom: 17 });
    } else {
      mapa.setView([u.lat, u.lng], 16);
    }
  }

  /* =========================================================
     PASO 3 · Geocerca y tipo de movimiento
     ========================================================= */
  function prepararPaso3() {
    const u = estado.ubicacion;
    const lista = estado.almacenes
      .map((a) => ({ a, d: App.geo.distancia(u.lat, u.lng, a.lat, a.lng) }))
      .sort((x, y) => x.d - y.d);
    const anterior = estado.almacen?.id;
    $('#sel-almacen').innerHTML = lista.map(({ a, d }) =>
      `<option value="${a.id}">${esc(a.nombre)} — a ${App.metros(d)}${d <= a.radio_m ? ' ✅' : ''}</option>`).join('');
    // Seleccionar: el anterior si sigue existiendo, si no, el más cercano
    const elegido = lista.find((x) => x.a.id === anterior) || lista[0];
    if (elegido) $('#sel-almacen').value = elegido.a.id;
    seleccionarAlmacen();
  }

  function seleccionarAlmacen() {
    estado.almacen = estado.almacenes.find((a) => a.id === $('#sel-almacen').value) || null;
    evaluarGeocerca();
    sugerirTipo();
    pintarMapa();
  }

  function evaluarGeocerca() {
    const u = estado.ubicacion, a = estado.almacen;
    if (!u || !a) { $('#geocerca').innerHTML = ''; return; }
    const d = App.geo.distancia(u.lat, u.lng, a.lat, a.lng);
    const dentro = d <= a.radio_m;
    const precisionOk = u.precision <= estado.parametros.precision_max_m;
    estado.validacionLocal = dentro && precisionOk;
    $('#geocerca').innerHTML = `
      <div class="dato-grid">
        <div class="dato"><div class="k">Distancia al almacén</div><div class="v">${App.metros(d)}</div></div>
        <div class="dato"><div class="k">Radio permitido</div><div class="v">${a.radio_m} m</div></div>
        <div class="dato"><div class="k">Precisión GPS</div><div class="v">±${Math.round(u.precision)} m</div></div>
      </div>
      ${dentro && precisionOk
        ? '<div class="aviso ok">✅ <b>Dentro de la geocerca</b> y con precisión aceptable.</div>'
        : `<div class="aviso error">❌ ${!dentro ? `<b>Fuera de la geocerca</b>: está a ${App.metros(d - a.radio_m)} del límite.` : ''}
           ${!precisionOk ? `<b>Precisión insuficiente</b> (máximo ±${estado.parametros.precision_max_m} m). Pulse "Volver a medir".` : ''}
           <br><span class="small">Si intenta registrar, el servidor lo rechazará y quedará auditado.</span></div>`}
      <p class="muted small">La validación definitiva se realiza en el servidor (Supabase).</p>`;
    actualizarBoton();
  }

  function sugerirTipo() {
    const u = estado.ultimo, a = estado.almacen;
    let tipo = 'entrada', motivo = 'Sugerido: ENTRADA (llegada a este almacén).';
    if (u && a && u.tipo === 'entrada' && u.almacen_id === a.id) {
      tipo = 'salida'; motivo = `Sugerido: SALIDA (el vehículo figura dentro de ${u.almacen}).`;
    } else if (u && u.tipo === 'entrada' && a && u.almacen_id !== a.id) {
      motivo = `Atención: el vehículo figura dentro de ${u.almacen}; primero debería registrarse su salida allí.`;
    }
    $('#tipo-' + tipo).checked = true;
    $('#sugerencia').textContent = motivo;
    actualizarBoton();
  }

  function actualizarBoton() {
    const tipo = document.querySelector('input[name="tipo"]:checked')?.value || 'entrada';
    const b = $('#btn-registrar');
    b.textContent = estado.validacionLocal
      ? `✅ Registrar ${tipo.toUpperCase()}`
      : `⚠️ Intentar registrar ${tipo.toUpperCase()}`;
    b.className = 'btn grande bloque ' + (estado.validacionLocal ? 'verde' : 'peligro');
  }

  async function registrar() {
    if (enviando) return;
    const tipo = document.querySelector('input[name="tipo"]:checked')?.value;
    const { vehiculo, ubicacion, almacen } = estado;
    if (!vehiculo || !ubicacion || !almacen || !tipo) return App.toast('Complete los pasos anteriores.', 'error');

    // La lectura GPS no debe ser antigua
    if (Date.now() - ubicacion.fecha.getTime() > 2 * 60 * 1000) {
      App.toast('La lectura GPS tiene más de 2 minutos. Se volverá a medir.', 'error');
      irAPaso(2);
      return obtenerGPS();
    }

    enviando = true;
    const btn = $('#btn-registrar');
    await App.cargando(btn, 'Registrando en el servidor...', async () => {
      const { data, error } = await App.sb.rpc('registrar_movimiento', {
        p_qr_token: vehiculo.qr_token,
        p_almacen_id: almacen.id,
        p_tipo: tipo,
        p_lat: ubicacion.lat,
        p_lng: ubicacion.lng,
        p_precision: ubicacion.precision,
        p_direccion: estado.direccion?.corto || estado.direccion?.texto || null,
        p_observacion: $('#observacion').value.trim() || null
      });
      if (error) { App.toast(App.mensajeError(error), 'error', 7000); return; }
      mostrarResultado(data, tipo);
    });
    enviando = false;
    actualizarBoton();
  }

  function mostrarResultado(r, tipo) {
    irAPaso(4);
    const u = estado.ubicacion;
    if (r.ok) {
      $('#resultado').innerHTML = `
        <div class="resultado-final">
          <div class="icono">✅</div>
          <h2>${esc(r.mensaje)}</h2>
        </div>
        <div class="dato-grid">
          <div class="dato"><div class="k">Vehículo</div><div class="v mono">${esc(r.placa)}</div></div>
          <div class="dato"><div class="k">Movimiento</div><div class="v">${App.badgeTipo(tipo)}</div></div>
          <div class="dato"><div class="k">Almacén</div><div class="v">${esc(r.almacen)}</div></div>
          <div class="dato"><div class="k">Hora del servidor</div><div class="v">${esc(App.fecha(r.registrado_en, true))}</div></div>
          <div class="dato"><div class="k">Operador</div><div class="v">${esc(App.perfil.nombre)}</div></div>
          <div class="dato"><div class="k">Distancia validada</div><div class="v">${App.metros(r.distancia_m)}</div></div>
          <div class="dato"><div class="k">Coordenadas</div><div class="v mono small">${u.lat.toFixed(6)}, ${u.lng.toFixed(6)} (±${Math.round(u.precision)} m)</div></div>
          <div class="dato" style="grid-column:1/-1"><div class="k">Dirección</div><div class="v">${esc(estado.direccion?.corto || '—')}</div></div>
        </div>
        <div class="acciones" style="margin-top:1rem;justify-content:center">
          <button class="btn naranja grande" id="btn-nuevo-escaneo">📷 Escanear otro vehículo</button>
          <a class="btn secundario grande" href="trazabilidad.html?v=${estado.vehiculo.id}">📍 Ver trazabilidad</a>
        </div>`;
      $('#btn-nuevo-escaneo').onclick = reiniciar;
      $('#paso-3').classList.add('bloqueado'); // evita registrar dos veces el mismo movimiento
      App.toast('Movimiento registrado.', 'ok');
    } else {
      $('#resultado').innerHTML = `
        <div class="resultado-final">
          <div class="icono">❌</div>
          <h2>Registro rechazado por el servidor</h2>
          <div class="aviso error" style="text-align:left">${esc(r.mensaje)}</div>
          <p class="muted small">El intento quedó registrado en la auditoría de rechazos.</p>
        </div>
        <div class="acciones" style="justify-content:center">
          <button class="btn grande" id="btn-reintentar">🔄 Volver a medir GPS y reintentar</button>
          <button class="btn secundario grande" id="btn-nuevo-escaneo">📷 Escanear otro vehículo</button>
        </div>`;
      $('#btn-reintentar').onclick = () => { irAPaso(2); obtenerGPS(); };
      $('#btn-nuevo-escaneo').onclick = reiniciar;
    }
  }

  function reiniciar() {
    Object.assign(estado, { vehiculo: null, ultimo: null, ubicacion: null, direccion: null, almacen: null });
    $('#info-vehiculo').classList.add('oculto');
    $('#zona-escaner').classList.remove('oculto');
    $('#datos-gps').innerHTML = '';
    $('#estado-gps').textContent = '';
    $('#btn-gps').textContent = '📍 Obtener ubicación';
    $('#geocerca').innerHTML = '';
    $('#observacion').value = '';
    $('#mapa').classList.add('oculto');
    irAPaso(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Eventos ---------- */
  $('#btn-camara').addEventListener('click', activarCamara);
  $('#btn-detener').addEventListener('click', detenerCamara);
  $('#archivo-qr').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    await detenerCamara();
    try {
      const texto = await crearLector().scanFile(archivo, false);
      await procesarQR(texto);
    } catch (err) {
      App.toast('No se encontró un código QR legible en la imagen.', 'error');
    }
  });
  $('#btn-gps').addEventListener('click', obtenerGPS);
  $('#sel-almacen').addEventListener('change', seleccionarAlmacen);
  document.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener('change', actualizarBoton));
  $('#btn-registrar').addEventListener('click', registrar);
  window.addEventListener('pagehide', detenerCamara);
})();
