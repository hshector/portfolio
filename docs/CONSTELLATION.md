# Constelación (fase F2)

`/constelacion` dibuja cada nota publicada como una estrella. Código en `src/constellation/`.

## Cómo funciona

- **Datos:** `public/data/graph.json` (slug, título, tipo y temática de cada nota) y `graph.bin` (posiciones
  3D y enlaces), generados en el build por `scripts/library/graph.ts`. El navegador no calcula nada de la
  distribución; solo la dibuja.
- **Distribución:** cada temática tiene un ancla invisible y sus notas tiran de ella, así que las temáticas
  forman galaxias separadas. Con el vault real (oct 2026): la mediana de longitud de los enlaces dentro de una
  temática pasó de 24,9 a 7,2 unidades, y los centros de las temáticas de estar a 7,6 a estar a 42,7.
- **Niveles de zoom:** de lejos, el nombre de cada temática en el centro de su galaxia; más cerca, los libros;
  muy cerca, los conceptos del centro de la vista; al elegir una estrella, ella y sus conexiones (el resto se
  apaga) y el panel con la nota.
- **Panel:** carga la página estática de la nota (`/biblioteca/<slug>`) y muestra su cuerpo. Se precarga al
  pasar el ratón por una estrella o un enlace. Los enlaces entre notas vuelan a su estrella.
- **Enlaces:** `/constelacion#<slug>` abre el cielo enfocado en esa nota.
- **Recorrido:** en un libro, "Recorrer este libro" visita sus 10 conceptos más conectados (← →).
- **Sin WebGL 2:** la página ofrece la vista en lista.

## Decisiones medidas

| Decisión | Por qué |
|---|---|
| `WebGLRenderer` en vez de `WebGPURenderer` | Con la misma escena en Chromium por software, WebGPURenderer (en su modo WebGL 2) iba a 1–3 fps y WebGLRenderer a 5–60 fps según la escena. Además three.js r186 envía `swizzle` en `createView`, que Chromium < 143 rechaza, y el paquete baja de 193 KB a 111 KB (Brotli). |
| Enlaces libro↔concepto solo al enfocar | Son 4.093 líneas muy largas que cruzan el cielo: se ve como una maraña y es lo que más cuesta dibujar. |
| Calidad adaptativa | Si tras 3 s el dispositivo va a menos de 45 fps, baja la resolución a 1× y luego atenúa los enlaces. |

## Lo que no se puede medir aquí

El CI y el entorno de desarrollo no tienen GPU (dibujan por software, a ~5–30 fps). Para medir en un
dispositivo real: abre `/constelacion?debug` y mira la línea verde (fps, calidad, draw calls y lo que tardó en
cargar la última nota).

## Peso (Brotli, oct 2026)

HTML 1 KB · JS 116 KB (three.js incluido) · CSS 14 KB (con KaTeX) · `graph.json` 70 KB · `graph.bin` 50 KB.
Total ≈ 251 KB más las fuentes, que comparte con el resto de la web.
