# Validation record

- Runtime: Node.js 24.19.0 on Linux x64.
- Combined check: 21 backend tests, 7 UI tests, and a successful production build.
- Additional provider checks after final schema validation changes: all 8 provider tests pass.
- Package manifest and lockfile dependency/runtime declarations agree.
- Both original provider key values are absent from the updated source, server, documentation, public assets, and generated browser build. Old Git history still contains the original source; revoke the old credentials.
- Controlled local benchmark: see `benchmark.json` and the workload description in the main README.
- Live provider calls: not run; replacement account credentials are required.
- Continuous integration: `.github/workflows/ci.yml` runs `npm ci` and `npm run check` on pushes and pull requests. Verify remote results in the repository's Actions tab; the local results above do not establish a remote CI pass.

To reproduce the automated checks, run `npm ci` followed by `npm run check`.

## Remaining manual check

The browser runtime could not start in this environment, so a visual review was not completed. The React behavior tests and production build passed. After starting the demo, check the desktop and mobile layout, select a city, expand a forecast, and clear the selection.
