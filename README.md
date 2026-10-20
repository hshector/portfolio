# Portfolio de Héctor

Web de proyectos: WarrenIA y una biblioteca de 48 libros y 3.175 conceptos conectados. Astro estático en
Cloudflare. El mundo 3D llegará en fases posteriores.

```bash
npm ci
git clone https://github.com/hshector/vault-libros vault   # privado: necesita acceso
npm run build      # genera la biblioteca desde ./vault, la web y el índice de búsqueda
npm run dev        # http://localhost:4321
npm test           # tests unitarios (paleta de temáticas)
npm run check:dist                  # enlaces, notas privadas y límites de Cloudflare
npm run test:e2e   # tests en navegador contra el servidor de Cloudflare local
```

Despliegue: [docs/DEPLOY.md](docs/DEPLOY.md). Normas de trabajo y contexto: [CLAUDE.md](CLAUDE.md).
