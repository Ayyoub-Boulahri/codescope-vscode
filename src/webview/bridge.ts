import type { FromWebview, ToWebview } from '../messages';
import { stepMarkers } from './lib/markers';
import { useSession } from './session';
import { useTraceStore } from './store/traceStore';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();

export function post(message: FromWebview) {
  vscode.postMessage(message);
}

/** Wire the stores to the extension host. */
export function connect() {
  window.addEventListener('message', (e: MessageEvent<ToWebview>) => {
    const msg = e.data;
    const store = useTraceStore.getState();
    switch (msg.type) {
      case 'program':
        if (msg.language !== store.language) store.setLanguage(msg.language);
        useSession.setState({ fileName: msg.fileName });
        break;
      case 'status':
        store.setStatus(msg.status, msg.message);
        break;
      case 'trace':
        if (msg.trace) store.setCode(msg.trace.code);
        store.loadTrace(msg.trace);
        break;
      case 'stale':
        useSession.setState({ stale: msg.stale });
        break;
      case 'interpreter':
        useSession.setState({ interpreter: msg.interpreter });
        break;
    }
  });

  useTraceStore.subscribe((s, prev) => {
    if (s.trace !== prev.trace || s.currentStep !== prev.currentStep) {
      post({ type: 'markers', markers: stepMarkers(s.trace, s.currentStep) });
    }
    if (s.stdin !== prev.stdin) post({ type: 'stdin', value: s.stdin });
  });

  post({ type: 'ready' });
}
