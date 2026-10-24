import * as vscode from 'vscode';
import type { LineMarkers } from '../messages';

/** Current / next / error line highlights in the traced file's editors. */
export class LineDecorations implements vscode.Disposable {
  private readonly current: vscode.TextEditorDecorationType;
  private readonly currentError: vscode.TextEditorDecorationType;
  private readonly next: vscode.TextEditorDecorationType;
  private readonly error: vscode.TextEditorDecorationType;

  constructor(media: vscode.Uri) {
    const icon = (name: string) => vscode.Uri.joinPath(media, `${name}.svg`);
    this.current = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('codescope.currentLineBackground'),
      gutterIconPath: icon('current'),
      overviewRulerColor: '#8b74ff',
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
    this.currentError = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('codescope.errorLineBackground'),
      gutterIconPath: icon('error'),
      overviewRulerColor: '#f43f5e',
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
    this.next = vscode.window.createTextEditorDecorationType({ gutterIconPath: icon('next') });
    this.error = vscode.window.createTextEditorDecorationType({ gutterIconPath: icon('error') });
  }

  /** Same rules as the web app's Monaco decorations (lineDecorations.ts). */
  apply(editor: vscode.TextEditor, markers: LineMarkers | null, reveal: boolean) {
    const lines: Record<'current' | 'currentError' | 'next' | 'error', number[]> = {
      current: [],
      currentError: [],
      next: [],
      error: [],
    };
    if (markers) {
      const { current, next, error, isError } = markers;
      if (next && next !== current) lines.next.push(next);
      if (current) {
        if (isError && error === current) lines.currentError.push(current);
        else lines.current.push(current);
      }
      if (error && (!isError || error !== current)) lines.error.push(error);
    }

    const doc = editor.document;
    const ranges = (ns: number[]) =>
      ns.filter((n) => n >= 1 && n <= doc.lineCount).map((n) => doc.lineAt(n - 1).range);
    editor.setDecorations(this.current, ranges(lines.current));
    editor.setDecorations(this.currentError, ranges(lines.currentError));
    editor.setDecorations(this.next, ranges(lines.next));
    editor.setDecorations(this.error, ranges(lines.error));

    const [focus] = ranges(lines.currentError.length ? lines.currentError : lines.current);
    if (reveal && focus) {
      editor.revealRange(focus, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }

  dispose() {
    this.current.dispose();
    this.currentError.dispose();
    this.next.dispose();
    this.error.dispose();
  }
}
