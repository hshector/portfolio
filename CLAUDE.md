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

- **Stack:** Astro (estático) + TypeScript. El 3D irá con three.js (WebGPURenderer + TSL) como isla de cliente.
- **Hosting:** Cloudflare Workers, solo ficheros estáticos (`wrangler.jsonc`). Gratis y sin límite de peticiones a estáticos.
- **Vault:** repo privado `hshector/vault-libros`. `tematicas.yml` asigna cada libro a una temática y dice qué se
  publica: de los libros solo la ficha, el resumen ejecutivo y la lista de conceptos; de los conceptos, todo.
  Las notas capítulo a capítulo NO se publican (derechos de autor).
- **Colores de temáticas:** `src/lib/themes.ts`. `tests/themes.test.ts` comprueba que sigan distinguiéndose
  (también con daltonismo). Si cambias un color, los tests deben seguir en verde.

## Comandos

- `npm run dev`: servidor de desarrollo.
- `npm run check` · `npm test` · `npm run build` · `npm run test:e2e`: lo mismo que ejecuta el CI.
- `npm run preview`: sirve `dist/` con wrangler, igual que Cloudflare en producción.
- En un entorno con Chromium preinstalado: `PW_CHROMIUM_PATH=<ruta> npm run test:e2e`.
