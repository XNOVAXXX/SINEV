#!/bin/sh
# Genera config.js con las variables de entorno del contenedor (.env)
cat > /usr/share/nginx/html/js/config.js <<CFG
window.SINEV_CONFIG = { url: "${SUPABASE_URL}", anonKey: "${SUPABASE_ANON_KEY}" };
CFG
