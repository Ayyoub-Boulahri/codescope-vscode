import { useTraceStore } from '../../store/traceStore';
import { PanelHeader } from '../ui/Panel';

export function StdinPanel() {
  const stdin = useTraceStore((s) => s.stdin);
  const setStdin = useTraceStore((s) => s.setStdin);
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="stdin" dot="bg-faint" htmlFor="stdin">
        <span className="text-[11px] text-faint">optional</span>
      </PanelHeader>
      <textarea
        id="stdin"
        value={stdin}
        onChange={(e) => setStdin(e.target.value)}
        placeholder="Input lines read by input() / prompt()"
        className="flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[13px] outline-none placeholder:text-faint"
      />
    </div>
  );
}
