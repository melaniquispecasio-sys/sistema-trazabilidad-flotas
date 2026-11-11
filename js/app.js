/* =========================================================
   app.js · Núcleo compartido por todas las páginas
   - Conexión con Supabase
   - Sesión, roles y menú
   - Utilidades de interfaz (avisos, ventanas, formatos)
   - Mapas (Leaflet), GPS (Geolocation API) y direcciones (Nominatim)
   ========================================================= */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const App = (window.App = {});

  /* ---------------- Utilidades generales ---------------- */
  App.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.$ = (sel, raiz = document) => raiz.querySelector(sel);
  App.$$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  App.fecha = (iso, conSegundos = false) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: conSegundos ? '2-digit' : undefined
    });
  };
  App.haceCuanto = (iso) => {
    if (!iso) return '';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'hace instantes';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} d`;
  };
  App.metros = (m) => {
    if (m === null || m === undefined || isNaN(m)) return '—';
    m = Number(m);
    if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km';
    return Math.round(m) + ' m';
  };

  App.ESTADOS = { disponible: 'Disponible', en_ruta: 'En ruta', mantenimiento: 'Mantenimiento', inactivo: 'Inactivo' };
  App.TIPOS = { entrada: 'Entrada', salida: 'Salida' };
  App.badge = (clase, texto) => `<span class="badge ${App.esc(clase)}">${App.esc(texto ?? clase)}</span>`;
  App.badgeEstado = (e) => App.badge(e, App.ESTADOS[e] || e);
  App.badgeTipo = (t) => App.badge(t, (t === 'entrada' ? '⬇ ' : '⬆ ') + (App.TIPOS[t] || t));

  /* ---------------- Avisos flotantes (toasts) ---------------- */
  App.toast = (mensaje, tipo = 'info', ms = 4500) => {
    let cont = document.getElementById('toasts');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'toasts';
      cont.setAttribute('role', 'status');
      document.body.appendChild(cont);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + tipo;
    t.textContent = mensaje;
    cont.appendChild(t);
    setTimeout(() => t.remove(), ms);
  };

  /* ---------------- Ventanas modales ---------------- */
  App.modal = ({ titulo, html, ancho = false, botones = [], alAbrir, alCerrar }) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal ${ancho ? 'ancho' : ''}" role="dialog" aria-modal="true">
        <div class="modal-cabecera"><h2>${App.esc(titulo)}</h2>
          <button class="modal-cerrar" aria-label="Cerrar">&times;</button></div>
        <div class="modal-cuerpo">${html}</div>
        ${botones.length ? '<div class="modal-pie"></div>' : ''}
      </div>`;
    const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', esc); if (alCerrar) alCerrar(); };
    const esc = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', esc);
    fondo.querySelector('.modal-cerrar').onclick = cerrar;
    fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
    const pie = fondo.querySelector('.modal-pie');
    botones.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.clase || '');
      btn.type = 'button';
      btn.textContent = b.texto;
      btn.onclick = () => (b.accion ? b.accion(cerrar, btn) : cerrar());
      pie.appendChild(btn);
    });
    document.body.appendChild(fondo);
    const cuerpo = fondo.querySelector('.modal-cuerpo');
    if (alAbrir) alAbrir(cuerpo, cerrar);
    return { el: cuerpo, cerrar };
  };

  App.confirmar = (mensaje, { titulo = 'Confirmar', textoOk = 'Aceptar', peligro = false } = {}) =>
    new Promise((resolve) => {
      let respondido = false;
      App.modal({
        titulo,
        html: `<p>${App.esc(mensaje)}</p>`,
        botones: [
          { texto: 'Cancelar', clase: 'secundario', accion: (c) => { respondido = true; c(); resolve(false); } },
          { texto: textoOk, clase: peligro ? 'peligro' : '', accion: (c) => { respondido = true; c(); resolve(true); } }
        ],
        alCerrar: () => { if (!respondido) resolve(false); }
      });
    });

  /* ---------------- Traducción de errores ---------------- */
  App.mensajeError = (err) => {
    if (!err) return 'Error desconocido.';
    const msg = String(err.message || err.error_description || err || '');
    const code = err.code || '';
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No hay conexión con el servidor. Revise su internet o la configuración de Supabase.';
    if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(msg)) return 'Debe confirmar su correo (revise su bandeja) o pida al administrador que lo confirme en Supabase.';
    if (/User already registered/i.test(msg)) return 'Ese correo ya está registrado.';
    if (/Password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espere unos minutos.';
    if (/JWT expired|PGRST301|PGRST303/i.test(msg + code)) return 'Su sesión expiró. Vuelva a iniciar sesión.';
    if (code === '23505') {
      if (/placa/i.test(msg + (err.details || ''))) return 'Ya existe un vehículo con esa placa.';
      if (/nombre/i.test(msg + (err.details || ''))) return 'Ya existe un almacén con ese nombre.';
      return 'Ese registro ya existe (dato duplicado).';
    }
    if (code === '23503') return 'No se puede eliminar porque tiene movimientos registrados. Cámbielo a "inactivo" en su lugar.';
    if (code === '23514') {
      if (/placa/i.test(msg)) return 'La placa debe tener el formato ABC-123.';
      if (/anio/i.test(msg)) return 'El año no es válido.';
      if (/radio/i.test(msg)) return 'El radio debe estar entre 20 y 5000 metros.';
      return 'Algún dato no cumple las reglas (revise formatos y rangos).';
    }
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'No tiene permisos para realizar esta acción.';
    if (code === 'PGRST205' || /Could not find the table|schema cache/i.test(msg)) return 'La base de datos no está preparada: ejecute el script SQL 01 en Supabase.';
    return msg || 'Ocurrió un error.';
  };

  /* ---------------- Conexión con Supabase ---------------- */
  App.configurado = Boolean(
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/PEGA_AQUI/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY)
  );
  if (App.configurado && window.supabase) {
    App.sb = window.supabase.createClient(cfg.SUPABASE_URL.trim(), cfg.SUPABASE_ANON_KEY.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  App.pantallaConfiguracion = (destino) => {
    const html = `
      <div class="tarjeta" style="max-width:640px;margin:2rem auto">
        <h1>⚙️ Falta configurar Supabase</h1>
        <p>Abra el archivo <span class="mono">js/config.js</span> y pegue:</p>
        <ol>
          <li><b>SUPABASE_URL</b>: la "Project URL" de su proyecto.</li>
          <li><b>SUPABASE_ANON_KEY</b>: la clave "anon public".</li>
        </ol>
        <p class="muted small">Las encuentra en Supabase → Project Settings → API. Guarde el archivo y recargue esta página.</p>
        ${!window.supabase ? '<div class="aviso error">No se pudo cargar la librería de Supabase. Revise su conexión a internet.</div>' : ''}
      </div>`;
    (destino || document.body).innerHTML = html;
  };

  /* ---------------- Sesión, roles y menú ---------------- */
  const MENU = [
    { id: 'dashboard', href: 'dashboard.html', texto: '📊 Dashboard' },
    { id: 'escanear', href: 'escanear.html', texto: '📷 Escanear', clase: 'destacado' },
    { id: 'vehiculos', href: 'vehiculos.html', texto: '🚚 Vehículos' },
    { id: 'almacenes', href: 'almacenes.html', texto: '🏭 Almacenes' },
    { id: 'movimientos', href: 'movimientos.html', texto: '📋 Movimientos' },
    { id: 'trazabilidad', href: 'trazabilidad.html', texto: '📍 Trazabilidad' },
    { id: 'usuarios', href: 'usuarios.html', texto: '👥 Usuarios', soloAdmin: true }
  ];

  function pintarEncabezado(pagina, perfil) {
    const header = document.getElementById('app-header') || document.body.insertBefore(document.createElement('header'), document.body.firstChild);
    header.className = 'app-header';
    const links = MENU.filter((m) => !m.soloAdmin || perfil.rol === 'admin')
      .map((m) => `<a href="${m.href}" class="${m.clase || ''} ${m.id === pagina ? 'activo' : ''}">${m.texto}</a>`).join('');
    header.innerHTML = `
      <div class="barra">
        <a class="marca" href="dashboard.html"><span class="logo">🚛</span>
          <span>${App.esc(cfg.NOMBRE_EMPRESA || 'Flotas')}<small>Trazabilidad de flotas</small></span></a>
        <button class="btn-menu" aria-label="Abrir menú">☰</button>
        <nav class="nav">${links}</nav>
        <div class="usuario-box">
          <span title="${App.esc(perfil.email)}">👤 <span class="nombre">${App.esc(perfil.nombre)}</span></span>
          <span class="rol">${perfil.rol === 'admin' ? 'Administrador' : 'Operador'}</span>
          <button class="btn chico secundario" id="btn-salir">Salir</button>
        </div>
      </div>`;
    header.querySelector('.btn-menu').onclick = () => header.classList.toggle('abierto');
    header.querySelector('#btn-salir').onclick = App.salir;
  }

  App.salir = async () => {
    try { await App.sb.auth.signOut(); } catch (e) { /* ignorar */ }
    location.href = 'index.html';
  };

  /**
   * Debe llamarse al inicio de cada página protegida.
   * Verifica sesión, carga el perfil (rol) y dibuja el menú.
   * Devuelve el perfil o null si no puede continuar.
   */
  App.iniciarPagina = async ({ pagina, soloAdmin = false } = {}) => {
    const main = document.querySelector('main') || document.body;
    if (!App.configurado || !App.sb) { App.pantallaConfiguracion(main); return null; }

    const { data: { session } } = await App.sb.auth.getSession();
    if (!session) { location.href = 'index.html'; return null; }

    const { data: perfil, error } = await App.sb.from('perfiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !perfil) {
      main.innerHTML = `<div class="contenedor"><div class="aviso error">
        No se encontró su perfil de usuario. ${App.esc(error ? App.mensajeError(error) : '')}<br>
        Verifique que ejecutó el script <b>sql/01_esquema_y_seguridad.sql</b> en Supabase.</div>
        <button class="btn" onclick="App.salir()">Volver al inicio</button></div>`;
      return null;
    }
    if (!perfil.activo) {
      await App.sb.auth.signOut();
      location.href = 'index.html?inactivo=1';
      return null;
    }

    App.perfil = perfil;
    App.esAdmin = perfil.rol === 'admin';
    pintarEncabezado(pagina, perfil);
    document.body.classList.toggle('es-admin', App.esAdmin);
    App.$$('[data-solo-admin]').forEach((el) => el.classList.toggle('oculto', !App.esAdmin));

    App.sb.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') location.href = 'index.html';
    });

    if (soloAdmin && !App.esAdmin) {
      main.innerHTML = `<div class="contenedor"><div class="aviso advertencia">
        🔒 Esta sección es solo para administradores.</div>
        <a class="btn" href="dashboard.html">Ir al dashboard</a></div>`;
      return null;
    }
    return perfil;
  };

  /* ---------------- Código QR ---------------- */
  App.qr = {
    PREFIJO: 'FLOTA-QR:',
    contenido: (token) => 'FLOTA-QR:' + token,
    /** Extrae el token (uuid) desde el texto leído por la cámara. */
    leer: (texto) => {
      const m = String(texto || '').trim().match(/^(?:FLOTA-QR:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
      return m ? m[1].toLowerCase() : null;
    },
    /** Dibuja el QR con QRCode.js dentro de un elemento. */
    dibujar: (elemento, token, tam = 220) => {
      elemento.innerHTML = '';
      return new window.QRCode(elemento, {
        text: App.qr.contenido(token), width: tam, height: tam,
        colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M
      });
    },
    /** Obtiene la imagen PNG (dataURL) del QR dibujado. */
    imagen: (elemento) => {
      const canvas = elemento.querySelector('canvas');
      if (canvas) return canvas.toDataURL('image/png');
      const img = elemento.querySelector('img');
      return img ? img.src : null;
    }
  };

  /* ---------------- Mapas (Leaflet + OpenStreetMap) ---------------- */
  App.mapa = {
    crear: (id, { centro = [-12.0464, -75.2], zoom = 6 } = {}) => {
      const mapa = L.map(id, { scrollWheelZoom: true }).setView(centro, zoom);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapa);
      return mapa;
    },
    icono: (emoji, color = '#1b4380', tam = 34) => L.divIcon({
      className: '',
      html: `<div style="background:${color};width:${tam}px;height:${tam}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">
               <span style="transform:rotate(45deg);font-size:${Math.round(tam * 0.5)}px">${emoji}</span></div>`,
      iconSize: [tam, tam], iconAnchor: [tam / 2, tam], popupAnchor: [0, -tam]
    }),
    puntoUsuario: () => L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb,0 2px 6px rgba(0,0,0,.4)"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9]
    }),
    /** Dibuja un almacén con su geocerca. */
    almacen: (mapa, a, { popup = true } = {}) => {
      const color = a.activo === false ? '#9aa5b5' : '#f28c28';
      const circulo = L.circle([a.lat, a.lng], { radius: a.radio_m, color, weight: 2, fillOpacity: 0.12 }).addTo(mapa);
      const marcador = L.marker([a.lat, a.lng], { icon: App.mapa.icono('🏭', color) }).addTo(mapa);
      if (popup) marcador.bindPopup(`<b>${App.esc(a.nombre)}</b><br>${App.esc(a.direccion)}<br>Geocerca: ${a.radio_m} m`);
      return { circulo, marcador };
    }
  };

  /* ---------------- GPS (Geolocation API) ---------------- */
  App.geo = {};

  /** Distancia en metros (Haversine). La validación definitiva se hace en el servidor. */
  App.geo.distancia = (lat1, lng1, lat2, lng2) => {
    const R = 6371000, rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  /**
   * Obtiene la ubicación del dispositivo. Escucha varias lecturas durante
   * unos segundos y se queda con la más precisa.
   */
  App.geo.obtenerUbicacion = ({ esperaMaxMs = 15000, precisionObjetivo = 20, alLeer } = {}) =>
    new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('Este navegador no permite obtener la ubicación.'));
      if (!window.isSecureContext) return reject(new Error('La ubicación solo funciona con HTTPS (GitHub Pages) o en localhost.'));
      let mejor = null, terminado = false, watchId = null;
      const fin = (ok, valor) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(timer);
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        ok ? resolve(valor) : reject(valor);
      };
      const timer = setTimeout(() => {
        mejor ? fin(true, mejor) : fin(false, new Error('No se obtuvo la ubicación a tiempo. Intente al aire libre o active el GPS.'));
      }, esperaMaxMs);
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lectura = {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            precision: pos.coords.accuracy, fecha: new Date(pos.timestamp)
          };
          if (!mejor || lectura.precision < mejor.precision) mejor = lectura;
          if (alLeer) alLeer(mejor);
          if (mejor.precision <= precisionObjetivo) fin(true, mejor);
        },
        (err) => {
          const mensajes = {
            1: 'Permiso de ubicación denegado. Toque el candado 🔒 de la barra de direcciones y permita "Ubicación".',
            2: 'Ubicación no disponible. Active el GPS del dispositivo.',
            3: 'Se agotó el tiempo para obtener la ubicación.'
          };
          if (err.code === 1 || !mejor) fin(false, new Error(mensajes[err.code] || err.message));
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: esperaMaxMs }
      );
    });

  /* ---------------- Direcciones (Nominatim / OpenStreetMap) ----------------
     Política de uso: máximo 1 petición por segundo, sin uso masivo,
     con atribución a OpenStreetMap y guardando resultados en caché. */
  const NOMINATIM = 'https://nominatim.openstreetmap.org';
  let colaNominatim = Promise.resolve();
  let ultimaPeticion = 0;

  function pedirNominatim(url) {
    const tarea = colaNominatim.then(async () => {
      const espera = Math.max(0, 1100 - (Date.now() - ultimaPeticion));
      if (espera) await new Promise((r) => setTimeout(r, espera));
      ultimaPeticion = Date.now();
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (resp.status === 429) throw new Error('Nominatim está ocupado (límite de uso). Intente en unos segundos.');
      if (!resp.ok) throw new Error('Nominatim respondió con error ' + resp.status);
      return resp.json();
    });
    colaNominatim = tarea.catch(() => {});
    return tarea;
  }
  const paramEmail = () => (cfg.NOMINATIM_EMAIL ? '&email=' + encodeURIComponent(cfg.NOMINATIM_EMAIL) : '');

  function leerCache(clave) {
    try { return JSON.parse(localStorage.getItem(clave)); } catch (e) { return null; }
  }
  function guardarCache(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin espacio: ignorar */ }
  }

  /** Coordenadas → dirección aproximada. */
  App.geo.direccion = async (lat, lng) => {
    const clave = `nominatim:rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
    const enCache = leerCache(clave);
    if (enCache) return enCache;
    const datos = await pedirNominatim(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es${paramEmail()}`);
    if (!datos || datos.error) return { texto: 'Dirección no disponible para estas coordenadas', corto: '' };
    const a = datos.address || {};
    const calle = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(' ');
    const lugar = a.city || a.town || a.village || a.municipality || a.county || '';
    const corto = [calle, a.suburb || a.neighbourhood, lugar, a.state].filter(Boolean).join(', ');
    const resultado = { texto: datos.display_name, corto: corto || datos.display_name };
    guardarCache(clave, resultado);
    return resultado;
  };

  /** Texto → lista de coordenadas (búsqueda de direcciones en Perú). */
  App.geo.buscar = async (texto) => {
    const q = texto.trim();
    if (q.length < 3) return [];
    const clave = 'nominatim:bus:' + q.toLowerCase();
    const enCache = leerCache(clave);
    if (enCache) return enCache;
    const datos = await pedirNominatim(`${NOMINATIM}/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=pe&limit=5&accept-language=es${paramEmail()}`);
    const lista = (datos || []).map((d) => ({ lat: Number(d.lat), lng: Number(d.lon), texto: d.display_name }));
    guardarCache(clave, lista);
    return lista;
  };

  /* ---------------- Exportar CSV (abre en Excel) ---------------- */
  App.descargarCSV = (nombreArchivo, filas, columnas) => {
    const celda = (v) => {
      const s = String(v ?? '');
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lineas = [columnas.map((c) => celda(c.t)).join(';')]
      .concat(filas.map((f) => columnas.map((c) => celda(typeof c.v === 'function' ? c.v(f) : f[c.k])).join(';')));
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /* ---------------- Botón con estado "cargando" ---------------- */
  App.cargando = async (boton, textoCargando, fn) => {
    const original = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '⏳ ' + textoCargando;
    try { return await fn(); }
    finally { boton.disabled = false; boton.innerHTML = original; }
  };
})();
