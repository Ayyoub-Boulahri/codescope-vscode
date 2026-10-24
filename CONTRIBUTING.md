# Developing CodeScope for VS Code

## How it works

```
┌──────────── Extension host (Node) ────────────┐        ┌────────── Webview (React) ──────────┐
│ visualize command ─▶ CodeScopePanel ─▶ runEngine│ Trace  │ TraceStore ─▶ Visualizer, playback  │
│        ▲ line decorations                │     │ ─────▶ │                                    │
│        └──────────── markers ◀───────────┼─────┼─────── │ current / next / error line        │
└──────────────────────────────────────────┼─────┘        └────────────────────────────────────┘
                     one process per run   ▼
        python tracer.py (sys.settrace)   |   node dist/jsEngine.js (Babel instrumentation)
```

- The engines are the web app's engines. Python runs `tracer.py` with your own interpreter (it
  reads a JSON request on stdin and writes the worker messages as JSON lines); JavaScript runs the
  Babel-instrumented engine in a forked Node process. Both produce the same `Trace` format
  (`src/engines/types.ts`), and the webview only plays it back.
- Each run is a fresh process. Engines stop themselves at the limits and return a partial trace;
  if a program blocks (e.g. `time.sleep`), the extension kills the process after the time limit
  and keeps the steps streamed so far.
- `src/messages.ts` is the protocol between the extension host and the webview.

| Path | What it does |
|---|---|
| `src/extension/panel.ts` | Webview panel: target file, runs, stdin, stale detection, editor sync |
| `src/extension/runEngine.ts` | Starts an engine process, collects the trace, hard timeout |
| `src/extension/decorations.ts` | Current / next / error line highlights |
| `src/extension/python.ts` | Finds the Python interpreter |
| `src/engines/` | Copied from the web app (`tracer.py` gains a CLI entry point) |
| `src/webview/` | Visualizer UI copied from the web app, themed with VS Code's colors |

The engines, visualizer, store and libs are copies of the web app's code: keep fixes in sync
until they move into a shared package.

## Commands

```bash
npm install
npm run build        # dist/extension.js, dist/jsEngine.js, dist/tracer.py, dist/webview/
npm run typecheck
npm run lint
npm run test         # engines + process runner; PYTHON=... picks the interpreter (snapshots need 3.14),
                     # OLD_PYTHON=<3.9 interpreter> also checks the version guard
npm run package      # codescope-<version>.vsix
```

Press `F5` in VS Code to open an Extension Development Host with the extension loaded. For
faster iteration run `npm run watch:extension` and `npm run watch:webview`, then reload the host
window after changes.

## Releasing

Bump `version` in `package.json`, add an entry to `CHANGELOG.md`, then `npx vsce publish`.
Images in `README.md` are resolved against the GitHub repository, so push before publishing.
