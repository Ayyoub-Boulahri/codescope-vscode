# Changelog

## 0.1.0 (preview)

- **CodeScope: Visualize File** traces the current Python or JavaScript file and steps through it
  in a panel beside the editor, highlighting the current, next and error lines in the editor.
- Call stack, heap with reference arrows, loop iterations, output, stdin and variable history.
- Python runs with the interpreter selected in the Python extension (shown in the panel, with a
  **Change** button); requires Python 3.10 or newer.
- JavaScript runs in Node.js with `require()` support.
- Disabled in untrusted workspaces, since it runs the file's code.
