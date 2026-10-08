# Native browser scenarios

These Playwright tests load current package sources through Vite. Vue queries,
component lifecycle, window focus, navigator state and IndexedDB execute in
Chromium. The shared fake remote is an allowed external-service boundary; tests
do not establish live backend interoperability.

Run with installed Chromium:

```sh
pnpm exec playwright install chromium
pnpm test:browser
```

The runner requires Linux with `xvfb-run` (provided by Ubuntu's `xvfb` package).
It creates a private Xvfb display and removes desktop display/session variables.
Remote Playwright connection environment variables are rejected before startup.
Chromium is forced to X11. Tests cannot open windows on your desktop; invoking
the Playwright config directly without the isolated runner fails before launch.
Vite automatic browser opening is disabled.
Interruption closes Vite and the owned process group, escalating to forced exit
after a bounded grace period if descendants ignore termination.

Most scenarios run headless. Only the `focus` project runs headed inside Xvfb,
because native tab focus is part of its contract. It disables Playwright's default
focus emulation, then changes active tabs with `bringToFront()`. Assertions verify
`document.hasFocus()`, rendered refreshed data, and absence of refresh requests
after real component unmount. Do not replace it with fabricated focus events.

Set `RSTORE_BROWSER_PORT` to an unused loopback port for concurrent runs. Set
`RSTORE_BROWSER_ARTIFACT_DIR` to control Vite caches, traces and failure artifacts;
the default is a unique directory under the system temporary directory. The
server refuses occupied ports and does not reuse an unrelated existing server.
Source fault probes must copy the repository source/config/fixtures into their
own directory and set private artifact paths; dependency symlinks alone do not
isolate mutable caches.

Run a focused scenario with `pnpm test:browser focus.spec.ts`. Existing playground
E2E suites remain separate: these tests protect library/browser contracts rather
than authentication, deployment or a complete playground application.
