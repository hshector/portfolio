# La isla (fase F3)

La portada (`/`) es una isla en 3D que se recorre a lomos de un toro negro, y es toda la web: los
dos proyectos se abren dentro de ella y nada lleva a otra página.

- **WarrenIA** se abre en la pantalla del pabellón de cristal (`#warrenia`, `#warrenia/<pestaña>`).
- **La biblioteca** es el cielo: desde el observatorio se sube a la constelación (`#observatorio`,
  `#observatorio/<nota>`).
- **Sobre mí** es una tarjeta en el taller (`#sobre-mi`).

Las páginas de siempre (`/warrenia`, `/constelacion`, `/biblioteca/…` y los proyectos bajo la isla)
siguen existiendo como respaldo oculto: para buscadores, para quien no tiene 3D (sin WebGL o con
movimiento reducido) y para enlaces directos. Con la isla en marcha, la página de debajo se oculta.

Código en `src/island/`:

| Fichero | Qué hace |
|---|---|
| `terrain.ts` | Forma de la isla, caminos, lugares, superficies, por dónde puede ir el toro y rutas del mapa. Sin three.js; con tests (`tests/island.test.ts`). |
| `palette.ts` | Las dos luces (atardecer y noche) y la mezcla según la distancia al observatorio. |
| `world.ts` | Cielo, terreno con arena mojada, mar con resaca, hierba, encinas, muros, flores, los cuatro lugares, molino, tu nombre en piedra y carteles. |
| `shaders.ts` | Trozos de shader compartidos: niebla, árboles que se vuelven translúcidos y copas que se mecen. |
| `bull.ts` | El toro: su postura de reposo, el pelaje, respiración, cola y cabeza que mira a los lugares. |
| `locomotion.ts` | Los pasos del toro, generados cada fotograma: paso, trote, medio galope y galope, con las pezuñas clavadas donde pisan. |
| `observatory.ts` | La subida del observatorio a la constelación y la vuelta, sin salir de la isla. |
| `pavilion.ts` | La entrada en el pabellón: la cámara se acerca a la pantalla y la demo de WarrenIA se abre encima. |
| `effects.ts` | Huellas que el mar borra y que de noche brillan, polvo de las pezuñas, polvo dorado y luciérnagas. |
| `birds.ts` | Bandadas que se espantan, gaviotas y mariposas. |
| `stars.ts` | El cielo nocturno es la biblioteca: una estrella por nota, con el color de su temática. |
| `audio.ts` | Sonido sintetizado (Web Audio): olas, viento, chicharras, grillos, pezuñas según el suelo y música. |
| `input.ts` | Teclado, ratón, joystick táctil y mando. |
| `app.ts` | Lo junta todo: cámara, día y noche, lugares, mapa, enlaces `#…`, calidad automática y la API de tests `window.__isla`. |

La demo de WarrenIA está en `src/warrenia-demo/` (ver más abajo) y el cielo interactivo en
`src/constellation/`, que se monta sobre el mismo lienzo y el mismo renderer que la isla.

## Decisiones

- **WebGLRenderer, no WebGPU.** Con el prototipo, Héctor midió 60 fps en su portátil y en su móvil
  (21 oct 2026). Además, el modo WebGL 2 de WebGPURenderer fue 15–60× más lento en las pruebas de la
  constelación (ver `CONSTELLATION.md`).
- **El toro** es «bull walk cycle», de Lucy Greenhill (CC BY 4.0), recoloreado en negro.
  - De su único ciclo (un paso) solo se usa la **postura de reposo**: dos instantes opuestos del paso
    (0,225 y 0,725) mezclados al 50 %, que dejan las patas rectas bajo el cuerpo.
  - **Todos los pasos se generan** cada fotograma sobre esa postura (`locomotion.ts`), con el método
    de [threejs-procedural-animals](https://github.com/majidmanzarpour/threejs-procedural-animals)
    (MIT):
    - una tabla de pasos de vaca (velocidad, frecuencia, fracción de apoyo y desfase de cada pata)
      decide, según la velocidad, el paso, el trote, el medio galope o el galope;
    - cada pezuña apoyada se queda clavada en el suelo donde pisó; la que vuela va al siguiente punto
      de apoyo, adelantado según la velocidad;
    - las patas se colocan con cinemática inversa analítica (ley del coseno) y el cuerpo sube y baja
      con la carga de cada cintura, con fase de vuelo en el galope.
  - El cambio pedido por Héctor: el galope antiguo aceleraba la animación de paso (unos 3,6 pasos
    por segundo, zancadas de ~2 m). Ahora a más velocidad las zancadas se alargan:

    | Paso | Velocidad | Zancadas por segundo | Zancada |
    |---|---|---|---|
    | Trote | 2,8 m/s | 1,20 | 2,32 m |
    | Medio galope | 4,8 m/s | 1,46 | 3,27 m |
    | Galope | 8,5 m/s | 1,69 | 5,04 m |

    Medido en el laboratorio de pasos: las pezuñas se hunden como mucho 10 mm y una pezuña apoyada se
    desliza como mucho 11 mm por fotograma.
  - Los huesos se giran con matrices completas, porque el esqueleto tiene nodos de compensación de
    escala.
  - Para regenerar el `.glb`: `scripts/assets/toro.sh` (gltf-transform, MIT). Pasa de 1.182.448 B a
    229.436 B (114 KB con gzip), y el resultado es idéntico byte a byte.
- **El observatorio** (`observatory.ts`): la cámara sube sobre la cúpula y mira al cielo, la isla se
  apaga, y las estrellas de la biblioteca dejan la bóveda y vuelan a su sitio en la constelación 3D.
  El paso al cielo interactivo no se nota porque cada estrella llega a la dirección y al tamaño
  exactos en que la ve la cámara de la constelación (`stars.ts`, `setMorphTarget`).
- **El pabellón de WarrenIA** (`pavilion.ts`): en su pared del fondo hay una pantalla de 5,4 × 3,2 m
  con la portada de la app dibujada desde los datos de la demo (`src/warrenia-demo/screen.ts`). La
  cámara se para delante, a la distancia en que la pantalla llena la vista, y la demo real se abre
  justo encima. En el móvil ocupa toda la pantalla y la isla deja de dibujarse mientras tanto.
- **La demo de WarrenIA** (`src/warrenia-demo/`) es la versión verde salvia (d0f5a4b), en español:
  - El código que calcula es el de WarrenIA, copiado en `vendor/warrenia/` con sus tests (que se
    ejecutan con los nuestros) por `scripts/warrenia/vendor.sh`.
  - Los datos son inventados: un inversor ficticio que aporta 450 € al mes desde octubre de 2023 a
    tres fondos genéricos («Indexado mundial», «Oro físico», «Momentum mundial») con precios
    simulados con semilla fija, y 36 «Empresa Demo» en el radar. Ningún nombre ni logo real.
  - La banda «Datos ficticios de demostración… No es asesoramiento financiero» está siempre a la
    vista, y la proyección dice «Un rango, no una promesa».
- **Tu nombre** son letras de piedra extruidas de Bricolage Grotesque ExtraBold (SIL OFL 1.1). Los
  contornos se extraen con `scripts/assets/name.ts` (opentype.js, MIT) a `name-glyphs.json`, de 8 KB.
- **Sonido sin ficheros:** todo se sintetiza en el navegador. No hay nada que licenciar ni que
  descargar. Empieza solo cuando el visitante pulsa el botón; hay un test que comprueba que antes no
  se crea ningún `AudioContext`.
- **La isla es siempre la misma:** todo lo aleatorio usa semillas fijas.

## Mediciones (21 oct 2026)

**Árboles translúcidos.** Medido en la isla final, en modo `?lite`, en 80 posiciones al azar. Se mide
la proporción de píxeles del toro que se ven, comparando con la misma vista sin árboles ni
edificios.

| | Toro tapado más de la mitad | Parte visible del toro (media) |
|---|---|---|
| Sin la transparencia | 17 de 80 vistas | 78 % |
| Con la transparencia | 0 de 80 vistas | 96 % |

La cámara también sube cuando hay una colina entre ella y el toro.

**Peso de la portada.**

| Pieza | Comprimido (gzip) | Nota |
|---|---|---|
| three.js | 154 KB | Compartido con la constelación |
| Código de la isla | 54 KB | |
| Demo de WarrenIA | 20 KB | Solo al acercarse al pabellón |
| Cielo interactivo | 14 KB | Solo al anochecer o al subir |
| Toro | 114 KB | |
| Fuentes | 116 KB | woff2 |

- Las estrellas (`/data/graph.*`) se cargan solo cuando empieza a anochecer.

**Llamadas de dibujo.** En calidad alta, desde el muelle: 144 llamadas y 574.000 triángulos. Unir las
31 piezas del muelle en una sola malla ahorró 25 llamadas.

**Calidad automática.**

| Nivel | Hierba | Densidad de píxeles | Sombras |
|---|---|---|---|
| Alta | 70.000 | ×2 | 2048 |
| Media | 32.000 | ×1,5 | 1024 |
| Baja | 12.000 | ×1 | Sin sombras |

- Los móviles empiezan en «media».
- Si dos ventanas seguidas de 2 s van por debajo de 45 fps, baja un nivel.
- Se puede forzar con `?calidad=alta|media|baja`.
- `?debug` muestra fps, nivel, llamadas y la noche.

**Tests de navegador.** `e2e/island.spec.ts`, en ordenador y móvil, cubre:

- arranque, con la página de debajo oculta;
- el menú «Saltar a…», que lleva a cada lugar sin salir de la isla;
- andar y galopar con el teclado, dejando huellas;
- joystick táctil;
- entrar en el pabellón, cambiar de pestaña en la demo y volver al toro;
- enlace directo a `#warrenia/<pestaña>` y el botón Atrás;
- noche y estrellas en el observatorio;
- subir a la constelación y volver;
- ruta desde el mapa;
- pájaros que se espantan;
- sonido apagado hasta que se pide;
- movimiento reducido;
- sin WebGL.

## Pendiente de comprobar en aparatos reales

- **Los fps de esta versión final** en el portátil y el móvil de Héctor. Los 60 fps medidos fueron
  con el prototipo; esta versión añade el toro animado, pájaros, flores, muros y estrellas.
- **Safari (iPhone/Mac)** y **un mando real**: el código usa la Gamepad API estándar, pero no se ha
  probado con un mando físico.
- **Los pasos nuevos** se juzgaron con capturas y con medidas en software, a pocos fps. Falta que
  Héctor los vea a 60 fps.
- **La subida al observatorio y la entrada al pabellón** a 60 fps en aparatos reales: aquí solo se
  han probado en software.
- **Cómo suena:** el sonido se ha probado aquí (se crea, se activa y no da errores), pero nadie lo
  ha escuchado todavía.
