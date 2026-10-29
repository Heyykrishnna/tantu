# tantu Frontend

The Next.js frontend foundation for **tantu — Your work, finally connected.** It currently displays the generated starter page. Product screens, authentication, and backend feature integration remain planned.

See the [project README](../README.md) for product scope and root commands, and the [development guide](../docs/development.md) for package and checkout details.

## Local development

Use Node.js 24 and npm 11. From the project root:

```bash
npm run setup
npm run dev:frontend
```

Or, from this package:

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No environment variables or backend connection are required by the current starter. Backend liveness is available separately at [localhost:4000/health/live](http://localhost:4000/health/live).

## Validation and builds

Run from this package:

```bash
npm run lint
npm run typecheck
npm run build
```

The type-check command generates Next.js route/layout types before invoking TypeScript. There is no frontend test suite or dedicated formatting command yet. `next/font/google` loads Geist fonts and may require network access during a build.

After a successful build:

```bash
npm run start
```

Follow [AGENTS.md](AGENTS.md) and the relevant guides in `node_modules/next/dist/docs/` before changing the application. The backend owns domain authorization, persistence, and provider rules; frontend clients must follow the [network contract policy](../contracts/README.md).
