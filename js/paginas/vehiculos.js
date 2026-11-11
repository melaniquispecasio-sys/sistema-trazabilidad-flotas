/* Vehículos: CRUD (RF02) y código QR único (RF03) */
(async function () {
  'use strict';
  const perfil = await App.iniciarPagina({ pagina: 'vehiculos' });
  if (!perfil) return;
  const { $, esc } = App;
  const ANIO_MAX = new Date().getFullYear() + 1;
  const REGEX_PLACA = /^[A-Z0-9]{3}-[0-9]{3}$/;
  let vehiculos = [];

  async function cargar() {
    const { data, error } = await App.sb.from('vehiculos').select('*').order('placa');
    if (error) { App.toast(App.mensajeError(error), 'error'); return; }
    vehiculos = data;
    pintar();
  }

  function pintar() {
    const q = $('#f-buscar').value.trim().toLowerCase();
    const est = $('#f-estado').value;
    const lista = vehiculos.filter((v) =>
      (!est || v.estado === est) &&
      (!q || `${v.placa} ${v.marca} ${v.modelo}`.toLowerCase().includes(q)));
    $('#contador').textContent = `${lista.length} de ${vehiculos.length} vehículos`;
    $('#tabla').innerHTML = lista.length ? lista.map((v) => `
      <tr>
        <td><b class="mono">${esc(v.placa)}</b></td>
        <td>${esc(v.marca)}</td>
        <td>${esc(v.modelo)}</td>
        <td>${v.anio}</td>
        <td>${App.badgeEstado(v.estado)}</td>
        <td class="small muted">${esc(App.fecha(v.creado_en))}</td>
        <td><div class="acciones">
          <button class="btn chico" data-qr="${v.id}">🔳 QR</button>
          <a class="btn chico secundario" href="trazabilidad.html?v=${v.id}">📍 Ruta</a>
          ${App.esAdmin ? `<button class="btn chico secundario" data-editar="${v.id}">✏️ Editar</button>
          <button class="btn chico peligro" data-eliminar="${v.id}">🗑️</button>` : ''}
        </div></td>
      </tr>`).join('') : '<tr><td colspan="7" class="vacio">No hay vehículos que coincidan.</td></tr>';
  }

  /* ---------- Formulario crear / editar ---------- */
  function abrirFormulario(v = null) {
    const opciones = Object.entries(App.ESTADOS)
      .map(([k, t]) => `<option value="${k}" ${v?.estado === k ? 'selected' : ''}>${t}</option>`).join('');
    App.modal({
      titulo: v ? `Editar vehículo ${v.placa}` : 'Nuevo vehículo',
      html: `
        <form id="form-veh" class="form-grid" novalidate>
          <div><label for="placa">Placa *</label>
            <input id="placa" required maxlength="7" placeholder="ABC-123" value="${esc(v?.placa || '')}" style="text-transform:uppercase">
            <div class="ayuda">Formato: 3 letras/números, guion, 3 números.</div></div>
          <div><label for="estado">Estado *</label><select id="estado">${opciones}</select></div>
          <div><label for="marca">Marca *</label><input id="marca" required maxlength="40" value="${esc(v?.marca || '')}" placeholder="Volvo"></div>
          <div><label for="modelo">Modelo *</label><input id="modelo" required maxlength="40" value="${esc(v?.modelo || '')}" placeholder="FH 460"></div>
          <div><label for="anio">Año *</label><input id="anio" type="number" required min="1980" max="${ANIO_MAX}" value="${v?.anio || ''}" placeholder="2020"></div>
          <div class="completo" id="form-error"></div>
        </form>
        ${v ? '' : '<p class="muted small">Al guardar se generará automáticamente un código QR único para el vehículo.</p>'}`,
      botones: [
        { texto: 'Cancelar', clase: 'secundario' },
        { texto: v ? 'Guardar cambios' : 'Registrar vehículo', clase: 'naranja', accion: (cerrar, btn) => guardar(v, cerrar, btn) }
      ],
      alAbrir: (el) => {
        const placa = $('#placa', el);
        placa.addEventListener('input', () => {
          let s = placa.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
          if (s.length > 3) s = s.slice(0, 3) + '-' + s.slice(3);
          placa.value = s;
        });
        placa.focus();
      }
    });
  }

  async function guardar(v, cerrar, btn) {
    const datos = {
      placa: $('#placa').value.trim().toUpperCase(),
      marca: $('#marca').value.trim(),
      modelo: $('#modelo').value.trim(),
      anio: parseInt($('#anio').value, 10),
      estado: $('#estado').value
    };
    const errores = [];
    if (!REGEX_PLACA.test(datos.placa)) errores.push('La placa debe tener el formato ABC-123.');
    if (datos.marca.length < 2) errores.push('Ingrese la marca.');
    if (!datos.modelo) errores.push('Ingrese el modelo.');
    if (!(datos.anio >= 1980 && datos.anio <= ANIO_MAX)) errores.push(`El año debe estar entre 1980 y ${ANIO_MAX}.`);
    if (errores.length) { $('#form-error').innerHTML = `<div class="aviso error">${errores.map(esc).join('<br>')}</div>`; return; }

    await App.cargando(btn, 'Guardando...', async () => {
      const consulta = v
        ? App.sb.from('vehiculos').update(datos).eq('id', v.id).select().single()
        : App.sb.from('vehiculos').insert(datos).select().single();
      const { data, error } = await consulta;
      if (error) { $('#form-error').innerHTML = `<div class="aviso error">${esc(App.mensajeError(error))}</div>`; return; }
      cerrar();
      App.toast(v ? 'Vehículo actualizado.' : `Vehículo ${data.placa} registrado con su QR.`, 'ok');
      await cargar();
      if (!v) verQR(data.id);
    });
  }

  async function eliminar(v) {
    const ok = await App.confirmar(`¿Eliminar el vehículo ${v.placa}? Si tiene movimientos no se podrá eliminar (cámbielo a "Inactivo").`,
      { titulo: 'Eliminar vehículo', textoOk: 'Eliminar', peligro: true });
    if (!ok) return;
    const { error } = await App.sb.from('vehiculos').delete().eq('id', v.id);
    if (error) return App.toast(App.mensajeError(error), 'error', 7000);
    App.toast('Vehículo eliminado.', 'ok');
    cargar();
  }

  /* ---------- Código QR ---------- */
  /** Genera una etiqueta PNG: QR + placa, lista para imprimir o descargar. */
  function etiquetaPNG(v) {
    const tmp = document.createElement('div');
    App.qr.dibujar(tmp, v.qr_token, 300);
    const qr = tmp.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = 400; c.height = 560;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#0b1f3a';
    ctx.font = 'bold 18px Segoe UI, Arial'; ctx.textAlign = 'center';
    ctx.fillText((window.APP_CONFIG.NOMBRE_EMPRESA || 'Flota').toUpperCase(), 200, 34);
    // margen blanco amplio alrededor del QR (zona de silencio) para lecturas confiables
    ctx.drawImage(qr, 50, 70, 300, 300);
    ctx.lineWidth = 4; ctx.strokeRect(100, 420, 200, 56);
    ctx.font = 'bold 38px Segoe UI, Arial'; ctx.fillText(v.placa, 200, 462);
    ctx.font = '13px Segoe UI, Arial'; ctx.fillStyle = '#5b6676';
    ctx.fillText(`${v.marca} ${v.modelo} · ${v.anio}`, 200, 505);
    ctx.fillText('Escanear en: Registrar llegada / salida', 200, 528);
    return c.toDataURL('image/png');
  }

  function imprimir(etiquetas) {
    const w = window.open('', '_blank');
    if (!w) return App.toast('Permita las ventanas emergentes para imprimir.', 'error');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Códigos QR</title>
      <style>body{font-family:Arial;margin:16px}.g{display:flex;flex-wrap:wrap;gap:16px}
      img{width:250px;border:1px dashed #999;page-break-inside:avoid}</style></head>
      <body><div class="g">${etiquetas.map((src) => `<img src="${src}">`).join('')}</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }

  function verQR(id) {
    const v = vehiculos.find((x) => x.id === id);
    if (!v) return;
    App.modal({
      titulo: `Código QR · ${v.placa}`,
      html: `
        <div class="qr-caja">
          <div class="qr" id="qr-dibujo"></div>
          <div class="placa-grande">${esc(v.placa)}</div>
          <div class="muted small">${esc(v.marca)} ${esc(v.modelo)} · ${v.anio} · ${App.badgeEstado(v.estado)}</div>
          <div class="muted small mono" title="Identificador único codificado en el QR">ID QR: ${esc(v.qr_token)}</div>
        </div>
        <div class="aviso info small">Pegue este QR en el vehículo. El operador lo escaneará en la opción <b>📷 Escanear</b> al llegar o salir de un almacén.</div>`,
      botones: [
        ...(App.esAdmin ? [{ texto: '♻️ Regenerar QR', clase: 'secundario', accion: (cerrar) => regenerar(v, cerrar) }] : []),
        { texto: '⬇️ Descargar PNG', clase: 'secundario', accion: () => {
          const a = document.createElement('a'); a.href = etiquetaPNG(v); a.download = `QR_${v.placa}.png`; a.click();
        } },
        { texto: '🖨️ Imprimir', accion: () => imprimir([etiquetaPNG(v)]) }
      ],
      alAbrir: (el) => App.qr.dibujar($('#qr-dibujo', el), v.qr_token, 240)
    });
  }

  async function regenerar(v, cerrar) {
    const ok = await App.confirmar(`Se generará un nuevo QR para ${v.placa}. El QR impreso anterior dejará de funcionar. ¿Continuar?`,
      { titulo: 'Regenerar QR', textoOk: 'Regenerar', peligro: true });
    if (!ok) return;
    const { error } = await App.sb.rpc('regenerar_qr', { p_vehiculo_id: v.id });
    if (error) return App.toast(App.mensajeError(error), 'error');
    cerrar();
    App.toast('Nuevo QR generado. Imprímalo y reemplace el anterior.', 'ok');
    await cargar();
    verQR(v.id);
  }

  /* ---------- Eventos ---------- */
  $('#f-buscar').addEventListener('input', pintar);
  $('#f-estado').addEventListener('change', pintar);
  $('#btn-nuevo').addEventListener('click', () => abrirFormulario());
  $('#btn-imprimir-todos').addEventListener('click', () => {
    const activos = vehiculos.filter((v) => v.estado !== 'inactivo');
    if (!activos.length) return App.toast('No hay vehículos activos.', 'error');
    imprimir(activos.map(etiquetaPNG));
  });
  $('#tabla').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const buscar = (id) => vehiculos.find((v) => v.id === id);
    if (b.dataset.qr) verQR(b.dataset.qr);
    if (b.dataset.editar) abrirFormulario(buscar(b.dataset.editar));
    if (b.dataset.eliminar) eliminar(buscar(b.dataset.eliminar));
  });

  await cargar();
})();
