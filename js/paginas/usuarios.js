/* Gestión de roles administrador / operador (RF01) */
(async function () {
  'use strict';
  const perfil = await App.iniciarPagina({ pagina: 'usuarios', soloAdmin: true });
  if (!perfil) return;
  const { $, esc } = App;
  let usuarios = [];

  async function cargar() {
    const { data, error } = await App.sb.from('perfiles').select('*').order('creado_en');
    if (error) return App.toast(App.mensajeError(error), 'error');
    usuarios = data;
    $('#tabla').innerHTML = usuarios.map((u) => {
      const yo = u.id === perfil.id;
      return `
      <tr>
        <td><b>${esc(u.nombre)}</b> ${yo ? '<span class="muted small">(usted)</span>' : ''}</td>
        <td>${esc(u.email)}</td>
        <td>${App.badge(u.rol, u.rol === 'admin' ? 'Administrador' : 'Operador')}</td>
        <td>${u.activo ? App.badge('activo', 'Activo') : App.badge('inactivo', 'Desactivado')}</td>
        <td class="small muted">${esc(App.fecha(u.creado_en))}</td>
        <td>${yo ? '<span class="muted small">—</span>' : `<div class="acciones">
          <button class="btn chico secundario" data-rol="${u.id}">${u.rol === 'admin' ? '⬇ Hacer operador' : '⬆ Hacer administrador'}</button>
          <button class="btn chico ${u.activo ? 'peligro' : 'verde'}" data-activo="${u.id}">${u.activo ? 'Desactivar' : 'Activar'}</button>
        </div>`}</td>
      </tr>`;
    }).join('');
  }

  async function actualizar(u, cambios, texto) {
    const ok = await App.confirmar(texto, { titulo: 'Confirmar cambio' });
    if (!ok) return;
    const { error } = await App.sb.rpc('admin_actualizar_usuario', {
      p_id: u.id, p_rol: cambios.rol ?? u.rol, p_activo: cambios.activo ?? u.activo
    });
    if (error) return App.toast(App.mensajeError(error), 'error');
    App.toast('Usuario actualizado.', 'ok');
    cargar();
  }

  $('#tabla').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const u = usuarios.find((x) => x.id === (b.dataset.rol || b.dataset.activo));
    if (!u) return;
    if (b.dataset.rol) {
      const nuevo = u.rol === 'admin' ? 'operador' : 'admin';
      actualizar(u, { rol: nuevo }, `¿Cambiar el rol de ${u.nombre} a ${nuevo === 'admin' ? 'ADMINISTRADOR' : 'OPERADOR'}?`);
    } else {
      actualizar(u, { activo: !u.activo }, u.activo
        ? `¿Desactivar a ${u.nombre}? No podrá usar el sistema.`
        : `¿Reactivar a ${u.nombre}?`);
    }
  });

  await cargar();
})();
