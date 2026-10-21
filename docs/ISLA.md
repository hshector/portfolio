# La isla (fase F3)

La portada (`/`) es una isla en 3D que se recorre a lomos de un toro negro. Debajo sigue la
página de siempre con los proyectos, y hay versión sin 3D.

Código en `src/island/`:

| Fichero | Qué hace |
|---|---|
| `terrain.ts` | Forma de la isla, caminos, lugares, superficies, por dónde puede ir el toro y rutas del mapa. Sin three.js; con tests (`tests/island.test.ts`). |
| `palette.ts` | Las dos luces (atardecer y noche) y la mezcla según la distancia al observatorio. |
| `world.ts` | Cielo, terreno con arena mojada, mar con resaca, hierba, encinas, muros, flores, los cuatro lugares, molino, tu nombre en piedra y carteles. |
| `shaders.ts` | Trozos de shader compartidos: niebla, árboles que se vuelven translúcidos y copas que se mecen. |
| `bull.ts`, `gaits.ts` | El toro: paso, trote y galope mezclados por velocidad, reposo que respira y cabeza que mira a los lugares. |
| `effects.ts` | Huellas que el mar borra y que de noche brillan, polvo de las pezuñas, polvo dorado y luciérnagas. |
| `birds.ts` | Bandadas que se espantan, gaviotas y mariposas. |
| `stars.ts` | El cielo nocturno es la biblioteca: una estrella por nota, con el color de su temática. |
| `audio.ts` | Sonido sintetizado (Web Audio): olas, viento, chicharras, grillos, pezuñas según el suelo y música. |
| `input.ts` | Teclado, ratón, joystick táctil y mando. |
| `app.ts` | Lo junta todo: cámara, día y noche, lugares, mapa, calidad automática y la API de tests `window.__isla`. |

## Decisiones

- **WebGLRenderer, no WebGPU.** Con el prototipo, Héctor midió 60 fps en su portátil y en su móvil
  (21 oct 2026). Además, el modo WebGL 2 de WebGPURenderer fue 15–60× más lento en las pruebas de la
  constelación (ver `CONSTELLATION.md`).
- **El toro** es «bull walk cycle», de Lucy Greenhill (CC BY 4.0), recoloreado en negro.
  - Solo trae un ciclo de paso, así que:
    - El **trote** y el **galope** se derivan de él (`gaits.ts`): se desplaza en el tiempo cada pata
      para que pisen en el orden del nuevo paso (diagonales en el trote; traseras y luego delanteras
      en el galope) y se amplía el giro de las patas.
    - Las fases se midieron con los huesos de las pezuñas.
    - El **reposo** mezcla al 50 % dos instantes opuestos del paso (0,225 y 0,725), que dejan las
      patas rectas bajo el cuerpo.
  - La velocidad de la animación sale de una medición: con la animación a velocidad normal, el
    cuerpo avanza 0,026 unidades del modelo por segundo. Así las pezuñas no patinan.
  - Los huesos que se giran a mano (cabeza, cuello, pecho, cola) se giran con matrices completas,
    porque el esqueleto tiene nodos de compensación de escala.
  - Para regenerar el `.glb`: `scripts/assets/toro.sh` (gltf-transform, MIT). Pasa de 1.182.448 B a
    229.436 B (114 KB con gzip), y el resultado es idéntico byte a byte.
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
| Código de la isla | 48 KB | |
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

- arranque y páginas de debajo;
- enlaces «Saltar a…»;
- andar y galopar con el teclado, dejando huellas;
- joystick táctil;
- entrar en WarrenIA con E;
- noche y estrellas en el observatorio;
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
- **El galope** se juzgó con capturas fotograma a fotograma y en movimiento en software, a pocos fps.
  Si no convence a 60 fps, el plan prevé dejar el toro en paso y trote.
- **Cómo suena:** el sonido se ha probado aquí (se crea, se activa y no da errores), pero nadie lo
  ha escuchado todavía.
