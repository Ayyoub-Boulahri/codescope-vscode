import { Visualizer } from './components/visualizer/Visualizer';
import { PlaybackBar } from './components/controls/PlaybackBar';
import { OutputPanel } from './components/panels/OutputPanel';
import { StdinPanel } from './components/panels/StdinPanel';
import { HistoryPanel } from './components/panels/HistoryPanel';
import { Panel } from './components/ui/Panel';
import { Toolbar } from './Toolbar';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

// The code itself stays in the VS Code editor; the extension highlights the current line there.
export default function App() {
  useKeyboardShortcuts();
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2">
      <Toolbar />
      <Panel className="min-h-96 flex-1">
        <Visualizer />
      </Panel>
      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
        <Panel className="h-32">
          <OutputPanel />
        </Panel>
        <Panel className="h-32">
          <StdinPanel />
        </Panel>
      </div>
      <Panel className="shrink-0">
        <PlaybackBar />
      </Panel>
      <Panel className="shrink-0">
        <HistoryPanel />
      </Panel>
    </div>
  );
}
