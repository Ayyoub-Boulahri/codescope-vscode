// Child process entry (dist/jsEngine.js): receives one RunRequest over IPC, sends WorkerMessages.
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { Trace, WorkerMessage } from '../engines/types';
import { runJavaScriptTrace } from '../engines/javascript/javascriptEngine';
import type { ProcessRunRequest } from './runEngine';

const post = (message: WorkerMessage) => process.send?.(message);

const MODULE_SYNTAX = /'import' and 'export' may appear only with 'sourceType: "module"'/;

/** Give the program CommonJS globals, like `node file.js`. Required modules run untraced. */
function provideModuleGlobals(fileName: string) {
  const module = { exports: {} };
  Object.assign(globalThis, {
    require: createRequire(fileName),
    module,
    exports: module.exports,
    __filename: fileName,
    __dirname: path.dirname(fileName),
  });
}

/** The engine parses scripts, so ES module syntax fails with a parser message; explain it. */
function explainModuleSyntax(trace: Trace): Trace {
  if (trace.error?.name !== 'SyntaxError' || !MODULE_SYNTAX.test(trace.error.message)) return trace;
  return {
    ...trace,
    error: {
      ...trace.error,
      message:
        'import/export (ES modules) are not supported yet. Use require() and module.exports instead.',
    },
  };
}

process.once('message', (request: ProcessRunRequest) => {
  const { code, stdin, limits, fileName } = request;
  provideModuleGlobals(fileName);
  post({ type: 'ready' });
  try {
    const trace = runJavaScriptTrace(code, stdin, limits, (steps, stdout) =>
      post({ type: 'steps', steps, stdout }),
    );
    post({ type: 'done', trace: explainModuleSyntax(trace) });
  } catch (err) {
    post({ type: 'fatal', message: err instanceof Error ? err.message : String(err) });
  }
});

// The extension kills this process after `done`; also exit if it goes away first.
process.on('disconnect', () => process.exit(0));
