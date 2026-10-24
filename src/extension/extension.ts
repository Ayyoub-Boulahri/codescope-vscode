import * as vscode from 'vscode';
import { CodeScopePanel, languageOf } from './panel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codescopeViz.visualizeFile', (uri?: vscode.Uri) =>
      visualize(context, uri),
    ),
  );
}

async function visualize(context: vscode.ExtensionContext, uri?: vscode.Uri) {
  // From the editor title button the URI is passed in; from the palette use the active editor.
  const doc = uri
    ? await vscode.workspace.openTextDocument(uri)
    : vscode.window.activeTextEditor?.document;
  if (!doc) {
    void vscode.window.showInformationMessage('CodeScope: open a Python or JavaScript file first.');
    return;
  }
  if (!languageOf(doc)) {
    void vscode.window.showWarningMessage(
      `CodeScope: ${doc.languageId} files are not supported yet (Python and JavaScript are).`,
    );
    return;
  }
  CodeScopePanel.show(context, doc);
}

export function deactivate() {}
