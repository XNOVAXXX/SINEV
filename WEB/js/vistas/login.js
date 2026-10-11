// ═══ Autenticación: inicio de sesión ═══
// Supabase responde en inglés: se traducen los errores más comunes
function mensajeLogin(error) {
  const m = error.message || '';
  if (/invalid login credentials/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'La cuenta aún no está activada. Contacta al administrador.';
  if (/rate limit|too many/i.test(m) || error.status === 429) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (/fetch|network/i.test(m)) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}
RUTAS.login = async () => {
  if (perfil) {
    location.hash = '#/dashboard';
    return;
  }

  $('#view').innerHTML = await cargarVista('login');

  $('#togglePassword').onclick = () => {
    const input = $('#fLogin').p;
    const button = $('#togglePassword');
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.innerHTML = `<i data-lucide="${visible ? 'eye' : 'eye-off'}"></i>`;
    button.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    icons();
  };

  $('#fLogin').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = $('#errLogin');
    const submit = e.target.querySelector('button[type="submit"]');
    err.textContent = '';
    submit.disabled = true;

    const { error } = await sb.auth.signInWithPassword({
      email: `${f.get('u').trim().toLowerCase()}@sinev.com`,
      password: f.get('p')
    });

    if (error) {
      console.error(error); err.textContent = mensajeLogin(error);
      submit.disabled = false;
      return;
    }

    await cargarPerfil();
    if (!perfil) {
      await sb.auth.signOut();
      err.textContent = 'Usuario sin perfil asignado.';
      submit.disabled = false;
      return;
    }

    location.hash = '#/dashboard';
  };

  icons();
};
