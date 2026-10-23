# La red de ideas (la biblioteca en 3D)

Cada nota publicada es una estrella y cada idea compartida, una línea de luz: una red al estilo del grafo de
Obsidian, con el color de cada temática. Se ve dentro de la isla, al
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
  pantalla, con el zoom flotando en un panel de cristal.
- **De nebulosa a red (oct 2026):** Héctor vio que el gas lo emborronaba todo y no dejaba ver qué se une con
  qué. Se quitó el gas y volvieron las líneas, ahora todas, con color y luz. El panel no cambió.
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
- **Líneas:** los 13.274 enlaces, en un solo dibujo instanciado de rectángulos en pantalla (así tienen grosor
  real y bordes suaves, cosa que `LineBasicMaterial` no da en WebGL). Cada una lleva el degradado entre los
  colores de sus dos notas; si une dos temáticas distintas, tira hacia un blanco cálido.
  - En reposo: las de libro a idea, muy tenues (0,06); entre ideas, 0,14; entre temáticas, 0,22.
  - Al pasar el ratón por una estrella se encienden las suyas.
  - Al elegir una: sus líneas se encienden y el resto baja casi a cero. De un libro, solo sus 10 ideas
    principales van a plena luz; las demás quedan a media luz para que no sea un «erizo» de 546 rayos.
- **Pulsos:** 700 puntos de luz que viajan por las líneas, un solo dibujo, movidos en el shader. En reposo
  recorren enlaces entre ideas; al elegir una estrella salen de ella hacia sus vecinas. Con movimiento reducido no
  hay pulsos.
- **Bloom** (`UnrealBloomPass`): solo para estrellas y pulsos. Las líneas se dibujan después, nítidas: con miles
  de líneas superpuestas, el bloom quemaba el centro en blanco (comprobado en captura).
- **Etiquetas**, como en Embedding Atlas de Apple: fuente del sistema, pequeñas, con un halo oscuro.
  - El cielo no nombra nada hasta que se elige una estrella: los temas y los libros ya están en el panel
    (petición de Héctor, oct 2026; antes había pastillas de temas, títulos de libros y una leyenda abajo).
  - Al elegir una estrella: su nombre y el de sus ideas principales. Ninguna pisa a otra ni al panel o el zoom.
- **Al llegar desde la isla** se ve ya la red entera. Antes, `resetView()` daba la animación de entrada por
  acabada sin aplicarla y la red quedaba invisible hasta tocar algo; el E2E de la isla lo comprueba ahora.
- **Tipografía:** la fuente del sistema (en Apple, SF Pro; su licencia no permite servirla en una web) e Inter
  (SIL OFL 1.1) en el resto.

## Referencias (licencias comprobadas en cada repositorio, oct 2026)

| Repositorio | Qué se tomó | Licencia |
|---|---|---|
| [apple/embedding-atlas](https://github.com/apple/embedding-atlas) | Estilo de las etiquetas y la idea de convertir la densidad de puntos en nubes | MIT |
| [vasturiano/3d-force-graph](https://github.com/vasturiano/3d-force-graph) | Tocar una estrella y volar hacia ella | MIT |
| [anvaka/pm](https://github.com/anvaka/pm) | Galaxias por color y el buscador como forma principal de moverse | MIT |
| nomic-ai/deepscatter | Descartado: CC BY-NC-SA (no comercial) | — |

No se ha copiado código de ninguno: la red es propia sobre three.js. Las líneas con luz se inspiran en la vista
de grafo de Obsidian (solo la idea; Obsidian no es de código abierto).

## Decisiones medidas

| Decisión | Por qué |
|---|---|
| `WebGLRenderer` en vez de `WebGPURenderer` | Con la misma escena en Chromium por software, WebGPURenderer (en su modo WebGL 2) iba a 1–3 fps y WebGLRenderer a 5–60 fps según la escena. Además three.js r186 envía `swizzle` en `createView`, que Chromium < 143 rechaza. |
| Las 13.274 líneas en un solo dibujo | La primera constelación las dibujaba como `LineSegments` de 1 px: una maraña gris. Ahora son rectángulos instanciados con grosor, color y transparencia por enlace, que bajan casi a cero fuera de la estrella elegida. |
| Líneas fuera del bloom | Con bloom sobre las líneas, la vista general quedaba blanca en el centro. |
| Calidad adaptativa | Si tras 3 s el dispositivo va a menos de 45 fps, primero se quita el bloom y después los pulsos (y, en la página propia, la resolución baja a 1×). `?calidad=alta` la fija. |
| Draw calls (medido con `?debug`, oct 2026) | 18 con bloom (el bloom son varias pasadas) y 5 sin él. |

## Medido en dispositivos reales

- Versión anterior, equipo de Héctor (DPR 1,5): 60 fps, calidad alta, 9 draw calls (oct 2026).
- **Esta versión (red, pulsos y bloom): pendiente de medir.** Abre `/constelacion?debug` y mira la línea verde
  (fps, calidad, draw calls). `?nobloom` y `?nopulse` quitan el bloom o los pulsos, para comparar.

## Lo que no se puede medir aquí

El CI y el entorno de desarrollo no tienen GPU (dibujan por software, a ~5–10 fps, así que ahí la calidad
adaptativa siempre quita el bloom).

## Peso (gzip, oct 2026)

Código de la red 21,3 KB (la nebulosa, 20,6), three.js 155 KB compartido con la isla,
`graph.json` 70 KB y `graph.bin` 50 KB (Brotli), Inter solo los subconjuntos que use la página.
