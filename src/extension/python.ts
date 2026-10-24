import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** The part of the Python extension's API (ms-python.python) used here. */
interface PythonApi {
  environments: {
    getActiveEnvironmentPath(resource?: vscode.Uri): { path: string };
    resolveEnvironment(env: {
      path: string;
    }): Promise<{ executable: { uri?: vscode.Uri } } | undefined>;
    onDidChangeActiveEnvironmentPath: vscode.Event<unknown>;
  };
}

export interface Interpreter {
  path: string;
  /** Where it came from, shown in the panel's tooltip. */
  source: 'setting' | 'python extension' | 'virtual environment' | 'PATH';
}

const PYTHON_EXTENSION = 'ms-python.python';

async function pythonApi(): Promise<PythonApi | undefined> {
  const ext = vscode.extensions.getExtension<PythonApi>(PYTHON_EXTENSION);
  if (!ext) return undefined;
  try {
    return ext.isActive ? ext.exports : await ext.activate();
  } catch {
    return undefined;
  }
}

async function fromPythonExtension(resource: vscode.Uri): Promise<string | undefined> {
  const api = await pythonApi();
  try {
    const env = await api?.environments.resolveEnvironment(
      api.environments.getActiveEnvironmentPath(resource),
    );
    return env?.executable.uri?.fsPath;
  } catch {
    return undefined;
  }
}

/** A .venv or venv in the file's folder or a parent, up to the workspace folder. */
function nearbyVenv(resource: vscode.Uri): string | undefined {
  if (resource.scheme !== 'file') return undefined;
  const root = vscode.workspace.getWorkspaceFolder(resource)?.uri.fsPath;
  const exe =
    process.platform === 'win32' ? path.join('Scripts', 'python.exe') : path.join('bin', 'python');
  let dir = path.dirname(resource.fsPath);
  for (let depth = 0; depth < 6; depth++) {
    for (const name of ['.venv', 'venv']) {
      const candidate = path.join(dir, name, exe);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (dir === root || parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** codescope.pythonPath, else the Python extension's interpreter, else a nearby venv, else PATH. */
export async function resolvePython(resource: vscode.Uri): Promise<Interpreter> {
  const configured = vscode.workspace
    .getConfiguration('codescope', resource)
    .get<string>('pythonPath')
    ?.trim();
  if (configured) return { path: configured, source: 'setting' };
  const selected = await fromPythonExtension(resource);
  if (selected) return { path: selected, source: 'python extension' };
  const venv = nearbyVenv(resource);
  if (venv) return { path: venv, source: 'virtual environment' };
  return { path: process.platform === 'win32' ? 'python' : 'python3', source: 'PATH' };
}

/** Let the user pick another interpreter: the Python extension's picker, or our setting. */
export async function pickInterpreter(resource: vscode.Uri) {
  const configured = vscode.workspace
    .getConfiguration('codescope', resource)
    .get<string>('pythonPath');
  if (!configured?.trim() && vscode.extensions.getExtension(PYTHON_EXTENSION)) {
    await vscode.commands.executeCommand('python.setInterpreter');
  } else {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'codescope.pythonPath');
  }
}

/** Fires when the Python extension's selected interpreter changes. */
export async function onInterpreterChange(listener: () => void): Promise<vscode.Disposable> {
  const api = await pythonApi();
  return (
    api?.environments.onDidChangeActiveEnvironmentPath(listener) ?? new vscode.Disposable(() => {})
  );
}

/** ~/miniconda3/bin/python3 instead of the full home path. */
export function displayPath(p: string) {
  const home = homedir();
  return p.startsWith(home + path.sep) ? '~' + p.slice(home.length) : p;
}
