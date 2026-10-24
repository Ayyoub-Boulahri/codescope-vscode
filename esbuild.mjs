// Bundles the extension host code. The webview is built separately by Vite (vite.config.ts).
import { context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

mkdirSync('dist', { recursive: true });
copyFileSync('src/engines/python/tracer.py', 'dist/tracer.py');

const ctx = await context({
  entryPoints: {
    extension: 'src/extension/extension.ts',
    // Forked per JavaScript run, so a runaway program can be killed.
    jsEngine: 'src/extension/jsEngineProcess.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
