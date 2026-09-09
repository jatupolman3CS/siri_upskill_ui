# Frontend

For the integrated Windows development stack, follow the [backend run instructions](../siri_upskill_backend/README.md). The `scripts/dev.ps1 Start` command starts this UI at **http://localhost:4202**, plus PostgreSQL, API, workers, cache and local email. Docker is optional.

Browser API requests use the same origin (`/api/*`); `ng serve` proxies them to port 5190. SSR uses `API_INTERNAL_URL` (default `http://localhost:5190`). Password authentication is enabled in Development; the UI bypass is opt-in. Node 24.15+ or 26 is suitable for the installed Angular version.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.4.

## Development server

To start only the UI after the API and its dependencies are running (skip this if `dev.ps1` already started it):

```bash
npm start -- --port 4202
```

Open `http://localhost:4202/`. The application automatically reloads when source files change. In Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
