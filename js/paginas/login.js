/* Página de inicio de sesión y registro (RF01) */
(async function () {
  'use strict';
  const { $, $$ } = App;
  const caja = $('#caja');
  const mensaje = $('#mensaje');
  const mostrar = (tipo, texto) => { mensaje.innerHTML = `<div class="aviso ${tipo}">${App.esc(texto)}</div>`; };

  if (!App.configurado || !App.sb) { App.pantallaConfiguracion(caja); return; }

  if (new URLSearchParams(location.search).has('inactivo')) {
    mostrar('error', 'Su usuario está desactivado. Contacte al administrador.');
  }

  // Si ya hay sesión, ir directo al dashboard
  const { data: { session } } = await App.sb.auth.getSession();
  if (session && !new URLSearchParams(location.search).has('inactivo')) { location.href = 'dashboard.html'; return; }

  // Pestañas
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('activo', x === b));
    $('#form-ingresar').classList.toggle('oculto', b.dataset.tab !== 'ingresar');
    $('#form-registro').classList.toggle('oculto', b.dataset.tab !== 'registro');
    mensaje.innerHTML = '';
  }));

  // Ingresar
  $('#form-ingresar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = e.submitter || $('#form-ingresar button');
    await App.cargando(boton, 'Ingresando...', async () => {
      const { error } = await App.sb.auth.signInWithPassword({
        email: $('#email').value.trim(), password: $('#clave').value
      });
      if (error) return mostrar('error', App.mensajeError(error));
      location.href = 'dashboard.html';
    });
  });

  // Registro
  $('#form-registro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = e.submitter || $('#form-registro button');
    await App.cargando(boton, 'Creando cuenta...', async () => {
      const { data, error } = await App.sb.auth.signUp({
        email: $('#r-email').value.trim(),
        password: $('#r-clave').value,
        options: {
          data: { nombre: $('#r-nombre').value.trim() },
          emailRedirectTo: location.href.split('?')[0].replace(/[^/]*$/, 'index.html')
        }
      });
      if (error) return mostrar('error', App.mensajeError(error));
      if (data.session) { location.href = 'dashboard.html'; return; }
      mostrar('ok', 'Cuenta creada. Revise su correo para confirmarla y luego inicie sesión.');
      $('.tabs button[data-tab="ingresar"]').click();
      mostrar('ok', 'Cuenta creada. Revise su correo para confirmarla y luego inicie sesión.');
      $('#email').value = $('#r-email').value.trim();
    });
  });
})();
