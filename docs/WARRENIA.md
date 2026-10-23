# WarrenIA en el portfolio

Dentro del edificio de WarrenIA (la isla, `#warrenia`) y en `/warrenia` (sin 3D) se abre **la propia app de
WarrenIA**: sus pantallas y su código. Usa el análisis real de la última noche, sin precios de mercado, y la
cartera de cada visitante se guarda solo en su navegador. Pedido por Héctor (oct 2026): «que no sea una demo
genérica, que sea con los datos de verdad, sin mis datos, con los logos y todas las funcionalidades».

## Cómo está hecho

```
WarrenIA (repo hshector/warrenia)                     Portfolio (este repo)
 motor, cada noche (market-data.yml)                    CI, cada día a las 11:47 UTC y en cada push
   └─ public-data.yml → release `public-data`  ──────►   scripts/warrenia/data.sh → .warrenia-public/data/
      engine/warrenia_engine/public.py                   vite.warrenia.config.ts → public/warrenia-app/
      (puntuaciones, razones, fundamentales,             (web de WarrenIA en vendor/warrenia/web
       logos; SIN precios)                                + src/warrenia-app: shims, router, store)
```

- **La app es la de WarrenIA, no una copia hecha a mano.** `scripts/warrenia/vendor.sh` copia sin tocar
  `web/app/(app)`, `web/components`, `web/lib` y los estilos (commit en `vendor/warrenia/README.md`). Solo
  cambia lo de `scripts/warrenia/demo.patch`:
  - dónde se mostraba un precio: la ficha y el comparador enseñan el gráfico de TradingView;
  - la ruta de los logos;
  - la fuente de precio por defecto de un instrumento nuevo, «Manual»;
  - el texto de la cuenta.
- **Lo que solo existe en un servidor** se sustituye al compilar (`src/warrenia-app/shims`), con las mismas
  funciones y tipos:
  - `lib/market/source` lee el extracto con `fetch`;
  - `lib/user/store` guarda en `localStorage`, con las mismas reglas que el `LocalStore` de la app;
  - Supabase, `next/link`, `next/navigation`, `next/cache` y `web-push`.
- **Las páginas de la app son componentes de servidor de Next.js.** `router.tsx` las ejecuta en el navegador:
  espera a cada componente `async` y deja el resto a React. Las acciones de servidor (`actions.ts`) se usan tal
  cual: validan con Zod, escriben en el store del navegador y su `revalidatePath` vuelve a pintar la página.
- **Va en un `iframe` del mismo sitio,** así React y Tailwind no tocan la isla. Las rutas van en el hash
  (`/warrenia-app/#/research/AAPL`) y la isla las refleja como `#warrenia/research/AAPL`.

## Qué datos se publican y por qué

La documentación de WarrenIA (`docs/ARCHITECTURE.md`, `docs/PLAN.md`) dice que las condiciones de sus
proveedores prohíben redistribuir los datos de mercado. Por eso la app real va con login. Héctor eligió (oct
2026) **«real, sin precios brutos»**:

| Dato | En el extracto | Por qué |
|---|---|---|
| Puntuaciones, ranking, estado, acción y sus razones | Sí | Lo calcula WarrenIA |
| Rentabilidades y medidas de riesgo (en %), historial del ranking | Sí | Calculadas por WarrenIA a partir de los precios |
| Cuentas anuales (fundamentales) | Sí | SEC EDGAR: contenido público reutilizable según la propia SEC |
| Tipos de cambio | Sí | BCE, citando la fuente |
| Logos | Sí, con «Logos provided by Logo.dev» | Logo.dev permite mostrarlos en una app; su plan gratuito pide el enlace en proyectos comerciales |
| Cierres, series de precios, splits/dividendos, niveles de medias móviles | **No** | Massive (EE. UU.) y EODHD (Europa) |

- **Filtro con lista cerrada y comprobación.** `public.py` arma el extracto campo a campo y `check()` hace
  fallar la publicación si aparece un precio (`px`, `price`, `series`, `sma50`…) o una frase que cite uno
  («today $120.10»). Tiene tests en `engine/tests/test_public.py`. Los datos de prueba del motor nunca se
  publican.
- **Gráfico de precio:** el widget gratuito de TradingView, con sus datos y su marca. Solo se carga si el
  visitante pulsa «Show the price chart», porque conecta el navegador con tradingview.com. Hay un E2E que lo
  comprueba.
- **Cartera del visitante:** sin precios públicos, cada instrumento se valora con los precios que el visitante
  introduce (la app ya tenía «Manual price»). Todo se queda en su `localStorage`.

## Comprobado

- La app compila y pasa los tipos con las sustituciones (`tsc -p src/warrenia-app`).
- 83 tests de `web/lib` de WarrenIA pasan con los del portfolio.
- E2E (`e2e/warrenia.spec.ts`, `island.spec.ts`, `library.spec.ts`):
  - el radar lista empresas y cada una abre su análisis;
  - no hay ningún «$precio» en la ficha;
  - TradingView no se carga hasta pedirlo;
  - una cartera introducida sobrevive a recargar;
  - el extracto no trae precios;
  - la app cabe en un móvil;
  - en la isla se entra y se navega, la dirección sigue a la app, se vuelve con Atrás y funciona el enlace
    `#warrenia/cartera` antiguo.
- `public.py` probado con los datos de prueba del motor: 661 fichas, 8,5 MB y ningún precio.
- **Sin comprobar aquí:** las condiciones exactas de Massive, EODHD, Logo.dev y TradingView. Desde este
  entorno no se pueden abrir sus webs (el proxy las bloquea). Lo de arriba sale de la documentación de WarrenIA
  y de búsquedas. Héctor debe leerlas: massive.com/terms, logo.dev (attribution y caching) y las condiciones
  de los widgets de TradingView.

## Coste

0 €:
- GitHub Actions: un trabajo de unos minutos tras el de cada noche.
- Release pública.
- Cloudflare: solo ficheros estáticos más.
- TradingView y Logo.dev en sus planes gratuitos.
