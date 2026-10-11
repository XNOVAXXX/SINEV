// @ts-nocheck  (este archivo corre en Deno dentro de Supabase; VS Code lo revisa como Node y mostraría falsos errores)
// Función de Supabase (Edge Function) "crear-usuario".
// Permite que un ADMINISTRADOR cree usuarios internos (administrador u operador) desde el Dashboard.
// La clave service_role vive aquí, en el servidor de Supabase, nunca en el navegador.
//
// Despliegue (sin instalar nada): Supabase → Edge Functions → Deploy a new function → Via Editor
//   · Nombre: crear-usuario   · Pega este archivo completo   · Deploy
//   · Deja activada la opción "Verify JWT".
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ROLES = ['administrador', 'operador'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return json({ error: 'La función no tiene configuradas las claves de Supabase' }, 500);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Quién llama: se valida el token de sesión contra Supabase Auth
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return json({ error: 'Sesión inválida o vencida. Inicia sesión de nuevo.' }, 401);

  // 2) Solo un administrador puede crear usuarios (se comprueba en la tabla perfiles, no en lo que diga el navegador)
  const { data: quien } = await admin.from('perfiles').select('rol').eq('id', auth.user.id).maybeSingle();
  if (quien?.rol !== 'administrador') return json({ error: 'Solo un administrador puede crear usuarios.' }, 403);

  // 3) Validación de datos
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Solicitud no válida' }, 400); }
  const nombre = String(body.nombre ?? '').trim();
  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const rol = String(body.rol ?? 'administrador');
  if (nombre.length < 2 || nombre.length > 80) return json({ error: 'El nombre debe tener entre 2 y 80 caracteres.' }, 400);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: 'El usuario debe tener 3-30 caracteres: letras minúsculas, números, punto, guion o guion bajo.' }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' }, 400);
  if (!ROLES.includes(rol)) return json({ error: 'Rol no válido.' }, 400);

  // 4) Crear la cuenta y su perfil
  const { data: creado, error: createError } = await admin.auth.admin.createUser({
    email: `${username}@sinev.com`, password, email_confirm: true,
  });
  if (createError || !creado?.user) {
    const yaExiste = /already|registered|exists/i.test(createError?.message ?? '');
    return json({ error: yaExiste ? `El usuario "${username}" ya existe.` : (createError?.message ?? 'No se pudo crear el usuario.') }, yaExiste ? 409 : 400);
  }
  const { error: perfilError } = await admin.from('perfiles').insert({ id: creado.user.id, username, nombre, rol });
  if (perfilError) {
    await admin.auth.admin.deleteUser(creado.user.id); // no dejar cuentas sin perfil
    return json({ error: 'No se pudo guardar el perfil: ' + perfilError.message }, 500);
  }
  return json({ ok: true, username, nombre, rol }, 201);
});
