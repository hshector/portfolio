# Despliegue en Cloudflare (gratis)

El CI (`.github/workflows/ci.yml`) construye y prueba la web en cada push. Solo despliega cuando existen
los dos secretos de Cloudflare en GitHub. Hasta entonces avisa y no hace nada más.

## Pasos (una sola vez)

1. Crea una cuenta en https://dash.cloudflare.com/sign-up. El plan gratuito no pide tarjeta.
2. En el panel, abre **Workers & Pages** una vez. La cuenta necesita un subdominio `*.workers.dev`. Si te pide
   elegir uno, elígelo. El de Héctor es `hectorsanchispont.workers.dev`, así que la web queda en
   https://hector-portfolio.hectorsanchispont.workers.dev
3. Copia tu **Account ID**: aparece en la página de inicio del panel (columna derecha, "Account ID").
4. Crea un **API token** en https://dash.cloudflare.com/profile/api-tokens → *Create Token* → plantilla
   **Edit Cloudflare Workers** → *Continue to summary* → *Create Token*. Cópialo: solo se muestra una vez.
5. En GitHub, abre https://github.com/hshector/portfolio/settings/secrets/actions → *New repository secret* y
   crea dos secretos:
   - `CLOUDFLARE_API_TOKEN` con el token del paso 4.
   - `CLOUDFLARE_ACCOUNT_ID` con el ID del paso 3.
6. Vuelve a lanzar el último CI (pestaña *Actions* → el último run → *Re-run all jobs*), o haz cualquier push.

## Qué pasa después

- **Push a `main`:** despliegue a producción con `wrangler deploy`.
- **Pull request:** versión de previsualización en `pr-<número>-hector-portfolio.<subdominio>.workers.dev`
  (`wrangler versions upload --preview-alias`). Requiere que producción se haya desplegado al menos una vez.
- Las peticiones a ficheros estáticos son gratis e ilimitadas. El plan gratuito tiene un tope de 20.000 ficheros
  por versión; la biblioteca agrupa las notas para no acercarse.
