// ═══ Núcleo: Supabase, sesión, permisos, utilidades y router ═══
const { url, anonKey } = window.SINEV_CONFIG;
const sb = supabase.createClient(url, anonKey);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = () => window.lucide && lucide.createIcons();

// Carga las plantillas HTML separadas de la lógica JavaScript.
async function cargarVista(nombre) {
  const r = await fetch(`vistas/${nombre}.html`);
  if (!r.ok) throw new Error(`No se pudo cargar la vista ${nombre}.`);
  return r.text();
}

// Permisos por rol (la seguridad real la aplican las políticas RLS y funciones de Supabase)
const PERM = {
  publico:       { dashboard: false, campanas: false, usuarios: false },
  operador:      { dashboard: true,  campanas: true,  usuarios: false },
  administrador: { dashboard: true,  campanas: true,  usuarios: true  },
};
let perfil = null;
const rol = () => perfil?.rol ?? 'publico';
const puede = k => PERM[rol()][k];

// Normas EURO y emisiones (mismo algoritmo determinista del proyecto original)
const LIM = { co: 1.0, nox: 0.08, pm: 0.025 }, MIN = 4;
const RANGOS = {1:[[2.3,3.2],[.6,1.1],[.09,.17]],2:[[1.7,2.6],[.28,.65],[.05,.11]],3:[[1.5,2.45],[.12,.24],[.03,.07]],
  4:[[.52,.98],[.032,.078],[.01,.0245]],5:[[.4,.95],[.02,.058],[.0015,.0049]],6:[[.28,.9],[.012,.055],[.0008,.0044]]};
function rng(seed, salt) {
  let h = (2166136261 ^ (salt * 16777619)) >>> 0;
  for (const ch of seed) { h = (h ^ ch.charCodeAt(0)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  return h / 0xFFFFFFFF;
}
const emisiones = (placa, n) => Object.fromEntries(['co','nox','pm'].map((k, i) => {
  const [a, b] = RANGOS[n][i];
  return [k, +(a + (b - a) * rng(placa, i + 1)).toFixed([2, 3, 4][i])];
}));
// Emisión acumulada (g) = factor de emisión (g/km) × kilometraje registrado en la base de datos
const emisionTotal = (factores, km) => Object.fromEntries(Object.entries(factores).map(([k, v]) => [k, v * km]));
const masaPartes = g => Math.abs(g) >= 1000 ? [(g / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 }), 'kg'] : [g.toLocaleString('es-CO', { maximumFractionDigits: 1 }), 'g'];
const fmtMasa = g => masaPartes(g).join(' ');
const fmtKm = km => km == null ? 'Sin dato' : Number(km).toLocaleString('es-CO') + ' km';
const esElectrico = v => v?.combustible === 'Electrico';
const badge = (n, comb) => comb === 'Electrico' ? '<span class="euro e0">Eléctrico · no aplica</span>'
  : `<span class="euro e${n ?? 0}">${n ? 'EURO ' + n : 'EURO sin dato'}</span>`;
const item = (l, v) => `<div><small>${l}</small><b>${esc(v)}</b></div>`;
const fechaCO = f => new Date(f).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

// ── Sesión ──
async function cargarPerfil() {
  const { data: { session } } = await sb.auth.getSession();
  perfil = null;
  if (session) perfil = (await sb.from('perfiles').select('*').eq('id', session.user.id).maybeSingle()).data;
  pintarUsuario(); pintarNav();
}
function pintarUsuario() {
  $('#user').innerHTML = perfil
    ? `<b>${esc(perfil.nombre)}</b> <span class="chip">${esc(perfil.rol)}</span> <button class="btn ghost" id="out">Cerrar sesión</button>`
    : `<button class="btn" id="in">Iniciar sesión</button>`;
  $('#sesion').className = perfil?.rol === 'administrador' ? 'admin' : perfil ? 'operador' : '';
  $('#sesion').textContent = perfil ? `Sesión activa como ${perfil.rol} — ${perfil.nombre}` : '';
  $('#in')?.addEventListener('click', abrirLogin);
  $('#out')?.addEventListener('click', () => sb.auth.signOut());   // el aviso SIGNED_OUT actualiza la interfaz
}
// Al cerrar sesión (botón, otra pestaña o sesión vencida) la interfaz vuelve al modo público
sb.auth.onAuthStateChange(evento => {
  if (evento !== 'SIGNED_OUT' || !perfil) return;
  perfil = null; pintarUsuario(); pintarNav();
  if (location.hash && location.hash !== '#/') location.hash = '#/'; else router();
});
const abrirLogin = () => { location.hash = '#/login'; };

document.addEventListener('click', e => {
  if (e.target.matches('[data-close]')) e.target.closest('dialog').close();
});

// ── Router por hash: #/  #/consultas[/PLACA]  #/dashboard ──
const RUTAS = {};   // se llena en home.js, consultas.js y dashboard.js
function pintarNav() {
  const r = (location.hash.replace(/^#\/?/, '').split('/')[0]) || '';
  const links = [['', 'Inicio'], ...(puede('dashboard') ? [['dashboard', 'Dashboard']] : []), ['consultas', 'Consultas']];
  $('#nav').innerHTML = links.map(([h, l]) => `<a href="#/${h}" class="${h === r ? 'on' : ''}">${l}</a>`).join('');
}
async function router() {
  const [r, param] = location.hash.replace(/^#\/?/, '').split('/');
  const rutaActual = r ?? '';
  document.body.classList.toggle('login-screen', rutaActual === 'login');
  pintarNav();
  const fn = RUTAS[rutaActual];
  if (!fn) { $('#view').innerHTML = `<div class="card locked"><h1 class="locked-title">404</h1><p>Página no encontrada.</p><a class="btn" href="#/">Volver al inicio</a></div>`; return; }
  let arg = ''; try { arg = param ? decodeURIComponent(param) : ''; } catch { arg = ''; }
  await fn(arg);
  icons(); window.scrollTo(0, 0);
}
