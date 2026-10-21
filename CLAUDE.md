# Normas de trabajo con Héctor

## Auditar antes de responder (obligatorio)

Nunca des una respuesta, recomendación o "sí, funciona" sin haber comprobado a fondo que de verdad funciona.

- Comprueba cada afirmación en la fuente primaria: documentación oficial, el código del repo, la licencia real o una prueba ejecutada. Un resumen de un blog o un recuerdo no basta.
- Si se puede probar (un build, un despliegue de prueba, un benchmark, un script), pruébalo y da los números medidos.
- Separa claramente lo **verificado** de lo **no verificado**. Si algo no se pudo comprobar, dilo y explica cómo se comprobará.
- Para servicios de terceros (hosting, APIs, modelos 3D, licencias): límites exactos del plan gratuito, qué pasa al superarlos y si puede generar cargos.

## Presupuesto: 0 €

Todo tiene que ser gratis: hosting, herramientas, assets y dominios. Antes de proponer algo de pago, busca la alternativa gratuita. Si no existe, dilo de forma explícita.

# El proyecto

Portfolio de Héctor: una isla 3D explorable (a lomos de un toro realista) con dos proyectos, WarrenIA y la
biblioteca de notas de lectura, que se recorre como una constelación. Plan completo:
https://claude.ai/artifact/A6TaTVqwyFcd9SjAfCQ3yq

- **Stack:** Astro (estático) + TypeScript. 3D con three.js y `WebGLRenderer` en la constelación y en la isla
  (medido, ver `docs/CONSTELLATION.md` y `docs/ISLA.md`).
- **Hosting:** Cloudflare Workers, solo ficheros estáticos (`wrangler.jsonc`). Gratis y sin límite de peticiones a estáticos.
- **Vault:** repo privado `hshector/vault-libros`. `tematicas.yml` asigna cada libro a una temática y dice qué se
  publica: de los libros solo la ficha, el resumen ejecutivo y la lista de conceptos; de los conceptos, todo.
  Las notas capítulo a capítulo NO se publican (derechos de autor).
- **Colores de temáticas:** `src/lib/themes.ts`. `tests/themes.test.ts` comprueba que sigan distinguiéndose
  (también con daltonismo). Si cambias un color, los tests deben seguir en verde.

## Biblioteca (fase F1)

- `scripts/library/`: lee el vault (`VAULT_DIR`, por defecto `./vault`), valida, convierte a HTML (KaTeX en el
  build) y genera `.generated/library.json`, `.generated/library-report.md` y `public/data/graph.{json,bin}`
  (posiciones 3D precalculadas para la constelación de F2).
- `scripts/check-dist.ts`: enlaces internos, que ningún libro publique sus notas privadas y límites de Cloudflare.
- URLs: `/biblioteca/<slug>` para libros y conceptos, `/biblioteca/tema/<id>` para temáticas.

## Constelación (fase F2)

- `/constelacion` (`src/pages/constelacion.astro` + `src/constellation/`): three.js `WebGLRenderer` (no
  WebGPU: ver `docs/CONSTELLATION.md`, con las mediciones). `/constelacion#<slug>` enfoca una nota.
- `?debug` muestra fps y calidad. `window.__constellation` es la API que usan los tests E2E.

## La isla (fase F3)

- `/` es la isla (`src/pages/index.astro` + `src/island/`), con la página de proyectos debajo y versión sin 3D
  (sin WebGL o con movimiento reducido). Decisiones, mediciones y créditos en `docs/ISLA.md`.
- Toro: «bull walk cycle» de Lucy Greenhill (CC BY 4.0), en `assets-src/toro/`; `scripts/assets/toro.sh` genera
  `src/assets/island/toro.glb`. El crédito tiene que seguir en el pie de la portada.
- `?lite` (tests sin GPU), `?debug` (fps y calidad), `?calidad=alta|media|baja`. `window.__isla` es la API de los tests.
- Sonido: solo sintetizado en el navegador, nunca empieza sin que el visitante lo active.

## Comandos

- `npm run dev`: servidor de desarrollo (antes, `npm run library` con `VAULT_DIR` apuntando al vault).
- `npm run check` · `npm test` · `npm run build` · `npm run check:dist` · `npm run test:e2e`: lo que ejecuta el CI.
- `npm run preview`: sirve `dist/` con wrangler, igual que Cloudflare en producción.
- En un entorno con Chromium preinstalado: `PW_CHROMIUM_PATH=<ruta> npm run test:e2e`.
