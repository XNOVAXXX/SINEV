import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, OPERADOR_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_PASSWORD || !OPERADOR_PASSWORD) {
  console.error('Faltan variables en .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD y OPERADOR_PASSWORD.');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8 || OPERADOR_PASSWORD.length < 8) {
  console.error('Las contraseñas deben tener al menos 8 caracteres.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const usuarios = [
  { username: 'admin',    password: ADMIN_PASSWORD,    nombre: 'Administrador', rol: 'administrador' },
  { username: 'operador', password: OPERADOR_PASSWORD, nombre: 'Operador',      rol: 'operador' },
];
for (const u of usuarios) {
  const { data, error } = await sb.auth.admin.createUser({ email: `${u.username}@sinev.com`, password: u.password, email_confirm: true });
  if (error) { console.log(u.username, '→', error.message); continue; }
  const r = await sb.from('perfiles').insert({ id: data.user.id, username: u.username, nombre: u.nombre, rol: u.rol });
  if (r.error) await sb.auth.admin.deleteUser(data.user.id);   // no dejar cuentas sin perfil
  console.log(u.username, r.error ? r.error.message : 'creado');
}
