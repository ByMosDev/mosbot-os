#!/bin/sh
set -e

# Generate runtime config from environment variables.
# This file is loaded by index.html before the app bundle, allowing
# VITE_API_URL and VITE_APP_NAME to be set at container start
# without rebuilding the image.
cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-}",
  VITE_APP_NAME: "${VITE_APP_NAME:-}"
};
EOF

exec nginx -g 'daemon off;'
