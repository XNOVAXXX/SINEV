// Crea WEB/js/config.js con las variables SUPABASE_URL y SUPABASE_ANON_KEY (Netlify las pasa al construir).
// Usa solo la clave ANON (pública). Nunca pongas aquí la service_role.
import { writeFileSync } from "node:fs";

const url = (process.env.SUPABASE_URL || "").trim();
const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();

if (!url || !anonKey) {
  console.error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en las variables del sitio.");
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  console.error("SUPABASE_URL debe verse como https://tu-proyecto.supabase.co");
  process.exit(1);
}

const config = { url: url.replace(/\/$/, ""), anonKey };
writeFileSync(new URL("../WEB/js/config.js", import.meta.url),
  "window.SINEV_CONFIG = " + JSON.stringify(config) + ";\n");
console.log("config.js creado para " + config.url);
