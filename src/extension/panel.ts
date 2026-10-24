import * as path from 'node:path';
import * as vscode from 'vscode';
import { DEFAULT_LIMITS, type Language } from '../engines/types';
import type { FromWebview, LineMarkers, ToWebview } from '../messages';
import { LineDecorations } from './decorations';
import { displayPath, onInterpreterChange, pickInterpreter, resolvePython } from './python';
import { type EngineRun, runEngine } from './runEngine';

const LANGUAGES: Record<string, Language> = { python: 'python', javascript: 'javascript' };

export function languageOf(doc: vscode.TextDocument): Language | undefined {
  return LANGUAGES[doc.languageId];
}

/** The single CodeScope panel. It visualizes one file at a time (the "target"). */
export class CodeScopePanel implements vscode.Disposable {
  private static instance: CodeScopePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly decorations: LineDecorations;
  private readonly disposables: vscode.Disposable[] = [];
  private target: vscode.Uri | undefined;
  private language: Language | undefined;
  private stdin = '';
  private markers: LineMarkers | null = null;
  private stale = false;
  private run: EngineRun | undefined;
  private runId = 0;
  private ready = false;
  private queue: ToWebview[] = [];
  private disposed = false;

  /** Show the panel for `doc` and run it. */
  static show(context: vscode.ExtensionContext, doc: vscode.TextDocument) {
    CodeScopePanel.instance ??= new CodeScopePanel(context);
    const instance = CodeScopePanel.instance;
    instance.panel.reveal(vscode.ViewColumn.Beside, true);
    instance.setTarget(doc);
    void instance.start();
  }

  private constructor(private readonly context: vscode.ExtensionContext) {
    const dist = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    this.panel = vscode.window.createWebviewPanel(
      'codescope',
      'CodeScope',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [dist] },
    );
    this.panel.iconPath = vscode.Uri.joinPath(media, 'favicon.svg');
    this.panel.webview.html = this.html(dist);
    this.decorations = new LineDecorations(media);

    this.disposables.push(
      this.decorations,
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.webview.onDidReceiveMessage((msg: FromWebview) => this.onMessage(msg)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.decorate(false)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length && this.isTarget(e.document) && !this.stale) {
          // Line numbers no longer match the trace: drop the highlights until the next run.
          this.stale = true;
          this.decorate(false);
          this.post({ type: 'stale', stale: true });
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('codescope.pythonPath')) this.rerunPython();
      }),
    );
    void onInterpreterChange(() => this.rerunPython()).then((d) =>
      this.disposed ? d.dispose() : this.disposables.push(d),
    );
  }

  private rerunPython() {
    if (this.target && this.language === 'python') void this.start();
  }

  private isTarget(doc: vscode.TextDocument) {
    return this.target?.toString() === doc.uri.toString();
  }

  private setTarget(doc: vscode.TextDocument) {
    if (!this.isTarget(doc)) {
      this.clearDecorations();
      this.target = doc.uri;
      this.markers = null;
    }
    this.language = languageOf(doc);
    const fileName = path.basename(doc.fileName);
    this.panel.title = `CodeScope: ${fileName}`;
    this.post({ type: 'program', fileName, language: this.language! });
  }

  private async start() {
    if (!this.target) return;
    this.run?.cancel();
    const id = ++this.runId;
    const doc = await vscode.workspace.openTextDocument(this.target);
    const language = languageOf(doc);
    if (!language) return;

    this.stale = false;
    this.markers = null;
    this.decorate(false);
    this.post({ type: 'stale', stale: false });
    this.post({ type: 'trace', trace: null });
    this.post({ type: 'status', status: 'running', message: 'Starting…' });

    const config = vscode.workspace.getConfiguration('codescope', doc.uri);
    const interpreter = language === 'python' ? await resolvePython(doc.uri) : undefined;
    if (id !== this.runId) return;
    this.post({
      type: 'interpreter',
      interpreter: interpreter
        ? { label: displayPath(interpreter.path), source: interpreter.source }
        : null,
    });
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist').fsPath;
    const cwd = doc.isUntitled
      ? (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd())
      : path.dirname(doc.fileName);
    const run = runEngine(
      {
        language,
        code: doc.getText(),
        stdin: this.stdin,
        limits: {
          ...DEFAULT_LIMITS,
          maxSteps: config.get('maxSteps', DEFAULT_LIMITS.maxSteps),
          timeoutMs: config.get('timeoutSeconds', DEFAULT_LIMITS.timeoutMs / 1000) * 1000,
        },
        cwd,
        fileName: doc.isUntitled ? path.join(cwd, 'untitled.js') : doc.fileName,
        pythonPath: interpreter?.path ?? '',
        tracerPath: path.join(dist, 'tracer.py'),
        jsEnginePath: path.join(dist, 'jsEngine.js'),
      },
      (message) => this.post({ type: 'status', status: 'running', message }),
    );
    this.run = run;
    try {
      const trace = await run.trace;
      this.post({ type: 'trace', trace });
      this.post({ type: 'status', status: 'done' });
    } catch (err) {
      this.post({
        type: 'status',
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private onMessage(msg: FromWebview) {
    switch (msg.type) {
      case 'ready':
        this.ready = true;
        this.queue.forEach((m) => void this.panel.webview.postMessage(m));
        this.queue = [];
        break;
      case 'run':
        void this.start();
        break;
      case 'stdin':
        this.stdin = msg.value;
        break;
      case 'pickInterpreter':
        // The change listeners below rerun the file once a new interpreter is chosen.
        if (this.target) void pickInterpreter(this.target);
        break;
      case 'markers':
        this.markers = msg.markers;
        this.decorate(true);
        break;
    }
  }

  private post(message: ToWebview) {
    if (this.ready) void this.panel.webview.postMessage(message);
    else this.queue.push(message);
  }

  private decorate(reveal: boolean) {
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.isTarget(editor.document)) {
        this.decorations.apply(editor, this.stale ? null : this.markers, reveal);
      }
    }
  }

  private clearDecorations() {
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.isTarget(editor.document)) this.decorations.apply(editor, null, false);
    }
  }

  private html(dist: vscode.Uri) {
    const webview = this.panel.webview;
    const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, name));
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    // framer-motion animates through inline styles, hence 'unsafe-inline' for styles only.
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join('; ');
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${asset('index.css')}" />
    <title>CodeScope</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${asset('index.js')}"></script>
  </body>
</html>`;
  }

  dispose() {
    CodeScopePanel.instance = undefined;
    this.disposed = true;
    // A cancelled run never settles; the counter also stops a run still resolving Python.
    this.runId++;
    this.run?.cancel();
    this.clearDecorations();
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
