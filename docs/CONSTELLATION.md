# La nebulosa (la biblioteca en 3D)

Cada nota publicada es una estrella y cada temática una galaxia de gas de color. Se ve dentro de la isla, al
subir al observatorio (`#observatorio`), y en `/constelacion` como respaldo. Código en `src/constellation/`;
interfaz en `src/components/ConstellationUI.astro`.

## El diseño (oct 2026)

Elegido por Héctor entre dos propuestas («Cristal» y «Panel»): **Panel, que se pliega en Cristal**.

- **Panel, como en Apple Maps:** a la izquierda (en el móvil, una hoja que sube desde abajo) con el buscador,
  «Biblioteca» y tres pestañas:
  - **Temas:** una tarjeta por temática con sus libros e ideas. Tocarla lleva la cámara a esa galaxia.
  - **Libros:** los 48, con autor y año.
  - **Recorridos:** rutas sugeridas de libro en libro (`routes.ts`). Solo se muestra una ruta si cada libro
    comparte ideas con el siguiente; lo comprueba el navegador con el grafo y lo prueba el E2E.
- **Ficha de una estrella:** tema, título, autor y año; tres cifras (ideas, libros enlazados por ideas en
  común, ideas con fecha); «Recorrer el libro» (sus 10 ideas más compartidas, con ← →); ideas principales;
  libros conectados con cuántas ideas comparten; el resumen y la lista completa.
- **Plegado («Cristal»):** el panel queda en su barra de arriba (marca y buscador) y el cielo ocupa toda la
  pantalla, con los filtros de temas y el zoom flotando en paneles de cristal.
- **La vista sigue al panel:** el centro de la cámara se desplaza (`setViewOffset`) para que el cielo quede en
  la parte libre de la pantalla, y se desliza al plegar o abrir el panel.

## Cómo se dibuja

- **Datos:** `public/data/graph.json` (slug, título, tipo y temática de cada nota; autor y año de cada libro) y
  `graph.bin` (posiciones 3D y enlaces), generados en el build por `scripts/library/graph.ts`. El navegador no
  calcula la distribución; solo la dibuja.
- **Distribución:** cada temática tiene un ancla invisible y sus notas tiran de ella, así que las temáticas
  forman galaxias separadas. Con el vault real (oct 2026): la mediana de longitud de los enlaces dentro de una
  temática pasó de 24,9 a 7,2 unidades, y los centros de las temáticas de estar a 7,6 a estar a 42,7.
- **Estrellas** (`style.ts`, compartido con el cielo de la isla para que el paso sea continuo): los libros son
  las más grandes y blancas; «Otros» se dibuja como un anillo para no depender solo del color.
- **Gas:** unas 500 nubes (una por cada seis notas, en su posición), cuadrados que miran a la cámara en un solo
  dibujo instanciado, con una textura de nube y el color de su temática.
- **Bloom** (`UnrealBloomPass`): hace brillar las estrellas más claras y el gas más denso.
- **Líneas:** solo del libro elegido a sus 10 ideas más compartidas (antes, cientos de líneas a la vez).
- **Etiquetas**, como en Embedding Atlas de Apple: fuente del sistema, pequeñas, con un halo oscuro.
  - De lejos: cada temática como una pastilla con su número de libros, y los libros más grandes.
  - Más cerca: los libros y luego las ideas del centro de la vista.
  - Al elegir una estrella: su nombre y el de sus ideas principales.
  - Ninguna pisa a otra ni al panel o los controles.
- **Tipografía:** la fuente del sistema (en Apple, SF Pro; su licencia no permite servirla en una web) e Inter
  (SIL OFL 1.1) en el resto.

## Referencias (licencias comprobadas en cada repositorio, oct 2026)

| Repositorio | Qué se tomó | Licencia |
|---|---|---|
| [apple/embedding-atlas](https://github.com/apple/embedding-atlas) | Estilo de las etiquetas y la idea de convertir la densidad de puntos en nubes | MIT |
| [vasturiano/3d-force-graph](https://github.com/vasturiano/3d-force-graph) | Tocar una estrella y volar hacia ella | MIT |
| [anvaka/pm](https://github.com/anvaka/pm) | Galaxias por color y el buscador como forma principal de moverse | MIT |
| nomic-ai/deepscatter | Descartado: CC BY-NC-SA (no comercial) | — |

No se ha copiado código de ninguno: la nebulosa es propia sobre three.js.

## Decisiones medidas

| Decisión | Por qué |
|---|---|
| `WebGLRenderer` en vez de `WebGPURenderer` | Con la misma escena en Chromium por software, WebGPURenderer (en su modo WebGL 2) iba a 1–3 fps y WebGLRenderer a 5–60 fps según la escena. Además three.js r186 envía `swizzle` en `createView`, que Chromium < 143 rechaza. |
| Sin la maraña de enlaces | Las 13.274 líneas entre notas eran lo que más costaba dibujar y lo que hacía ilegible el cielo. Ahora solo hay 10 líneas, las del libro elegido. |
| Calidad adaptativa | Si tras 3 s el dispositivo va a menos de 45 fps, primero se quita el bloom y después, en la página propia, la resolución baja a 1×. |

## Medido en dispositivos reales

- Versión anterior, equipo de Héctor (DPR 1,5): 60 fps, calidad alta, 9 draw calls (oct 2026).
- **Esta versión (gas y bloom): pendiente de medir.** Abre `/constelacion?debug` y mira la línea verde (fps,
  calidad, draw calls). `?nobloom` la dibuja sin bloom, para comparar.

## Lo que no se puede medir aquí

El CI y el entorno de desarrollo no tienen GPU (dibujan por software, a ~5–10 fps, así que ahí la calidad
adaptativa siempre quita el bloom).

## Peso (gzip, oct 2026)

Código de la nebulosa 20,6 KB (antes 13,8; el bloom y el panel), three.js 155 KB compartido con la isla,
`graph.json` 70 KB y `graph.bin` 50 KB (Brotli), Inter solo los subconjuntos que use la página.
