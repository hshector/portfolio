// Suggested routes through the library ("Recorridos"): books visited one after another. Each step
// must share ideas with the next; the panel only shows a route whose every step does (checked in
// the browser against the graph, and by e2e/constellation.spec.ts).

export interface Route {
  title: string;
  books: string[];
}

export const ROUTES: Route[] = [
  { title: 'Petróleo, mapas y poder', books: ['daniel-yergin-the-prize', 'tim-marshall-prisioneros-de-la-geografia', 'tim-marshall-el-poder-de-la-geografia'] },
  { title: 'Cómo funciona el dinero', books: ['daniel-fernandez-mendez-dinero-un-viaje-desde-mesopotamia-hasta-el-bitcoin', 'perry-mehrling-the-new-lombard-street', 'lyn-alden-broken-money'] },
  { title: 'Riesgo y azar', books: ['peter-l-bernstein-against-the-gods', 'nassim-nicholas-taleb-enganados-por-el-azar', 'nassim-nicholas-taleb-el-cisne-negro'] },
];
