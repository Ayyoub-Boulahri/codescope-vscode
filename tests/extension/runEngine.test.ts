import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { type EngineRequest, runEngine } from '../../src/extension/runEngine';

const ROOT = join(__dirname, '../..');
const LIMITS = { maxSteps: 300, timeoutMs: 1000, maxOutput: 10_000 };

const request = (over: Partial<EngineRequest>): EngineRequest => ({
  language: 'python',
  code: '',
  stdin: '',
  limits: LIMITS,
  cwd: ROOT,
  fileName: join(ROOT, 'program'),
  pythonPath: process.env.PYTHON ?? 'python3',
  tracerPath: join(ROOT, 'dist/tracer.py'),
  jsEnginePath: join(ROOT, 'dist/jsEngine.js'),
  ...over,
});

beforeAll(() => {
  execSync('node esbuild.mjs', { cwd: ROOT, stdio: 'ignore' });
}, 60_000);

describe('runEngine', () => {
  it('runs Python', async () => {
    const trace = await runEngine(request({ code: 'x = 2\nprint(x * 21)\n' })).trace;
    expect(trace.stdout).toBe('42\n');
    expect(trace.steps.length).toBeGreaterThan(0);
  });

  it('runs JavaScript in a child process', async () => {
    const trace = await runEngine(
      request({ language: 'javascript', code: 'let x = 2;\nconsole.log(x * 21);\n' }),
    ).trace;
    expect(trace.stdout).toBe('42\n');
  });

  it('lets JavaScript require built-in and local modules', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'codescope-'));
    writeFileSync(join(dir, 'helper.js'), 'module.exports = { value: 7 };\n');
    const trace = await runEngine(
      request({
        language: 'javascript',
        code: [
          "const path = require('path');",
          "const { value } = require('./helper');",
          'console.log(path.basename(__filename), value);',
        ].join('\n'),
        cwd: dir,
        fileName: join(dir, 'main.js'),
      }),
    ).trace;
    expect(trace.error).toBeUndefined();
    expect(trace.stdout).toBe('main.js 7\n');
  });

  it('explains that ES module syntax is not supported', async () => {
    const trace = await runEngine(
      request({ language: 'javascript', code: "import fs from 'fs';\nconsole.log(1);\n" }),
    ).trace;
    expect(trace.error?.message).toMatch(/Use require\(\)/);
  });

  it('imports Python modules next to the file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'codescope-'));
    writeFileSync(join(dir, 'helper.py'), 'VALUE = 7\n');
    const trace = await runEngine(
      request({ code: 'from helper import VALUE\nprint(VALUE)\n', cwd: dir }),
    ).trace;
    expect(trace.error).toBeUndefined();
    expect(trace.stdout).toBe('7\n');
  });

  it('kills a blocked program and keeps the partial trace', async () => {
    const trace = await runEngine(
      request({ code: 'import time\nprint("before")\ntime.sleep(60)\n' }),
    ).trace;
    expect(trace.limitReached).toBe('timeout');
    expect(trace.steps.length).toBeGreaterThan(0);
  }, 10_000);

  it('kills a busy JavaScript loop', async () => {
    const trace = await runEngine(
      request({
        language: 'javascript',
        code: 'const end = Date.now() + 60000;\nwhile (Date.now() < end) {}\n',
        limits: { ...LIMITS, maxSteps: 1e9 },
      }),
    ).trace;
    expect(trace.limitReached).toBe('timeout');
  }, 10_000);

  // Set OLD_PYTHON to a Python 3.9 (or older) interpreter to run this one.
  it.skipIf(!process.env.OLD_PYTHON)('refuses Python older than 3.10', async () => {
    const pythonPath = process.env.OLD_PYTHON!;
    await expect(runEngine(request({ code: 'pass\n', pythonPath })).trace).rejects.toThrow(
      /needs Python 3.10 or newer/,
    );
  });

  it('explains a missing interpreter', async () => {
    await expect(
      runEngine(request({ code: 'pass\n', pythonPath: 'no-such-python' })).trace,
    ).rejects.toThrow(/Python was not found/);
  });
});
