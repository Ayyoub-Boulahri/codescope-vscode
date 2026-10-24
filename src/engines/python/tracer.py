# Records a step-by-step trace of a user program with sys.settrace.
# Run by the extension with the user's Python interpreter (see _main at the bottom).
# Output follows the Trace format in src/engines/types.ts.

import ast
import builtins
import io
import json
import math
import sys
import threading
import time
import types

USER_FILE = "<user>"
MAX_DEPTH = 3
MAX_ITEMS = 50
BATCH_SIZE = 200


class _Limit(BaseException):
    """Base for limit exceptions. BaseException so user `except Exception` cannot swallow it."""

    kind = ""


class StepLimit(_Limit):
    kind = "steps"


class TimeLimit(_Limit):
    kind = "timeout"


class OutputLimit(_Limit):
    kind = "output"


class LimitedStringIO(io.StringIO):
    def __init__(self, max_chars):
        super().__init__()
        self.max_chars = max_chars
        self.size = 0

    def write(self, s):
        if self.size + len(s) > self.max_chars:
            room = max(0, self.max_chars - self.size)
            super().write(s[:room])
            self.size += room
            raise OutputLimit()
        self.size += len(s)
        return super().write(s)


# ---------------------------------------------------------------- loops


class LoopInfo:
    __slots__ = ("start", "end", "kind", "owner")

    def __init__(self, start, end, kind, owner):
        self.start = start
        self.end = end
        self.kind = kind
        self.owner = owner  # first line of the enclosing function/class, 0 for module


def collect_loops(tree):
    """Map owner key -> list of LoopInfo. The owner key matches a code object's co_firstlineno."""
    loops = {}

    def owner_key(node):
        lines = [node.lineno] + [d.lineno for d in getattr(node, "decorator_list", [])]
        return min(lines)

    def visit(node, owner):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                visit(child, owner_key(child))
                continue
            if isinstance(child, (ast.For, ast.AsyncFor, ast.While)):
                kind = "while" if isinstance(child, ast.While) else "for"
                loops.setdefault(owner, []).append(
                    LoopInfo(child.lineno, child.end_lineno, kind, owner)
                )
            visit(child, owner)

    visit(tree, 0)
    return loops


class LoopTracker:
    """Per-frame loop state. Iteration n+1 starts when execution comes back to the header from the body."""

    def __init__(self, loops):
        self.loops = loops  # sorted by start line
        self.state = {}  # start line -> [iteration, entered_body, last_state_dict]

    def update(self, line, frame_id):
        for loop in self.loops:
            st = self.state.get(loop.start)
            inside = loop.start <= line <= loop.end
            if not inside:
                if st is not None:
                    # The final header check (loop exhausted) does not start a new iteration.
                    if not st[1] and st[0] > 1 and st[2] is not None:
                        st[2]["iteration"] -= 1
                    del self.state[loop.start]
                continue
            if st is None:
                st = [1, False, None]
                self.state[loop.start] = st
            elif line == loop.start:
                if st[1] or loop.start == loop.end:
                    st[0] += 1
                    st[1] = False
            else:
                st[1] = True
        result = []
        for loop in self.loops:
            st = self.state.get(loop.start)
            if st is None:
                continue
            entry = {
                "id": "%s:%d" % (frame_id, loop.start),
                "kind": loop.kind,
                "startLine": loop.start,
                "endLine": loop.end,
                "iteration": st[0],
            }
            # Keep the dict so a final header check can be corrected in place.
            st[2] = entry if line == loop.start else None
            result.append(entry)
        return result


# ---------------------------------------------------------------- serialization


class Serializer:
    def __init__(self):
        self.labels = {}
        self.keepalive = []  # keep objects alive so id() values are never reused

    def label(self, obj):
        key = id(obj)
        label = self.labels.get(key)
        if label is None:
            label = "h%d" % (len(self.labels) + 1)
            self.labels[key] = label
            self.keepalive.append(obj)
        return label

    def value(self, v, heap, depth=0):
        t = type(v)
        if v is None:
            return {"type": "primitive", "value": None, "pyType": "NoneType"}
        if t is bool:
            return {"type": "primitive", "value": v, "pyType": "bool"}
        if t is int:
            if abs(v) > 2**53:
                return {"type": "truncated", "preview": _short(repr(v))}
            return {"type": "primitive", "value": v, "pyType": "int"}
        if t is float:
            if math.isnan(v) or math.isinf(v):
                return {"type": "truncated", "preview": repr(v)}
            return {"type": "primitive", "value": v, "pyType": "float"}
        if t is str:
            return {"type": "primitive", "value": v, "pyType": "str"}
        if isinstance(v, (types.FunctionType, types.BuiltinFunctionType, types.MethodType)):
            return {"type": "function", "name": getattr(v, "__qualname__", getattr(v, "__name__", "?"))}
        if isinstance(v, type):
            return {"type": "function", "name": "class " + v.__name__}
        if t in (list, tuple, dict, set, frozenset) or _is_instance(v):
            if depth >= MAX_DEPTH:
                return {"type": "truncated", "preview": _short(_safe_repr(v))}
            ref = self.label(v)
            if ref not in heap:
                heap[ref] = None  # placeholder breaks cycles
                heap[ref] = self.heap_object(v, ref, heap, depth + 1)
            return {"type": "ref", "id": ref}
        return {"type": "truncated", "preview": _short(_safe_repr(v))}

    def heap_object(self, v, ref, heap, depth):
        t = type(v)
        entries = []
        if t in (list, tuple):
            kind = "list" if t is list else "tuple"
            for i, item in enumerate(v[:MAX_ITEMS]):
                entries.append({"key": i, "value": self.value(item, heap, depth)})
            extra = len(v) - MAX_ITEMS
        elif t is dict:
            kind = "dict"
            for i, (k, item) in enumerate(v.items()):
                if i >= MAX_ITEMS:
                    break
                entries.append({"key": self.value(k, heap, depth), "value": self.value(item, heap, depth)})
            extra = len(v) - MAX_ITEMS
        elif t in (set, frozenset):
            kind = "set"
            try:
                items = sorted(v)
            except TypeError:
                items = list(v)
            for i, item in enumerate(items[:MAX_ITEMS]):
                entries.append({"key": i, "value": self.value(item, heap, depth)})
            extra = len(v) - MAX_ITEMS
        else:
            kind = "instance"
            attrs = [(k, a) for k, a in vars(v).items() if not k.startswith("__")]
            for k, item in attrs[:MAX_ITEMS]:
                entries.append({"key": k, "value": self.value(item, heap, depth)})
            extra = len(attrs) - MAX_ITEMS
        if extra > 0:
            entries.append({"key": "…", "value": {"type": "truncated", "preview": "… %d more" % extra}})
        obj = {"id": ref, "kind": kind, "entries": entries}
        if kind == "instance":
            obj["className"] = type(v).__name__
        return obj


def _is_instance(v):
    return hasattr(v, "__dict__") and not isinstance(v, (types.ModuleType, type)) and type(v).__module__ == "__main__"


def _safe_repr(v):
    try:
        return repr(v)
    except Exception:
        return "<%s>" % type(v).__name__


def _short(s, n=60):
    return s if len(s) <= n else s[: n - 1] + "…"


def _visible_local(name, value):
    if name.startswith("__") and name.endswith("__"):
        return False
    if isinstance(value, types.ModuleType):
        return False
    if isinstance(value, (types.FunctionType, type)):
        code = getattr(value, "__code__", None)
        if code is not None:
            return code.co_filename == USER_FILE
        return getattr(value, "__module__", None) == "__main__"
    if isinstance(value, types.BuiltinFunctionType):
        return False
    return True


# ---------------------------------------------------------------- tracer


class Tracer:
    def __init__(self, code, stdin, max_steps, timeout_ms, max_output, emit):
        self.code = code
        self.max_steps = max_steps
        self.deadline = time.monotonic() + timeout_ms / 1000.0
        self.emit = emit
        self.stdout = LimitedStringIO(max_output)
        self.stdin = io.StringIO(stdin)
        self.steps = []
        self.emitted = 0
        self.serializer = Serializer()
        self.frame_ids = {}
        self.trackers = {}
        self.frame_loops = {}
        self.loops = {}
        self.limit = None
        self.stopped = False
        self.unwinding = set()  # frames an exception is propagating out of

    # -- helpers

    def frame_id(self, frame):
        fid = self.frame_ids.get(frame)
        if fid is None:
            fid = "f%d" % (len(self.frame_ids) + 1)
            self.frame_ids[frame] = fid
        return fid

    def user_stack(self, frame):
        stack = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == USER_FILE:
                stack.append(f)
            f = f.f_back
        stack.reverse()
        return stack

    def check_limits(self):
        if self.limit is not None:
            raise self.limit
        if len(self.steps) >= self.max_steps:
            self.limit = StepLimit()
        elif time.monotonic() > self.deadline:
            self.limit = TimeLimit()
        if self.limit is not None:
            raise self.limit

    def record(self, frame, event, return_value=None, exception=None):
        heap = {}
        stack = []
        loops = []
        for f in self.user_stack(frame):
            fid = self.frame_id(f)
            locals_ = {}
            order = []
            for name, value in f.f_locals.items():
                if not _visible_local(name, value):
                    continue
                locals_[name] = self.serializer.value(value, heap)
                order.append(name)
            stack.append({"id": fid, "name": f.f_code.co_name, "line": f.f_lineno, "locals": locals_, "localsOrder": order})
            loops.extend(self.frame_loops.get(f, []))
        step = {
            "index": len(self.steps),
            "line": frame.f_lineno,
            "event": event,
            "stack": stack,
            "heap": {k: v for k, v in heap.items() if v is not None},
            "stdoutLength": self.stdout.size,
            "loops": loops,
        }
        if event == "return":
            step["returnValue"] = self.serializer.value(return_value, step["heap"])
        if exception is not None:
            step["exception"] = exception
        self.steps.append(step)
        if len(self.steps) - self.emitted >= BATCH_SIZE:
            self.flush()

    def flush(self):
        batch = self.steps[self.emitted :]
        self.emitted = len(self.steps)
        if self.emit is not None and batch:
            self.emit(json.dumps(batch), self.stdout.getvalue())

    def input(self, prompt=""):
        """input() that echoes what it reads, like a terminal would."""
        self.stdout.write(str(prompt))
        line = self.stdin.readline()
        if not line:
            raise EOFError("EOF when reading a line (add input lines in the stdin box)")
        self.stdout.write(line if line.endswith("\n") else line + "\n")
        return line.rstrip("\n")

    # -- trace functions

    def global_trace(self, frame, event, arg):
        if self.stopped or frame.f_code.co_filename != USER_FILE:
            return None
        if event == "call":
            self.check_limits()
            owner = 0 if frame.f_code.co_name == "<module>" else frame.f_code.co_firstlineno
            self.trackers[frame] = LoopTracker(self.loops.get(owner, []))
            # The module "call" has no useful line; its first "line" event follows.
            if frame.f_code.co_name != "<module>":
                self.record(frame, "call")
        return self.local_trace

    def local_trace(self, frame, event, arg):
        if self.stopped:
            return None
        if event == "line":
            self.unwinding.discard(frame)
            self.check_limits()
            tracker = self.trackers.get(frame)
            if tracker is not None:
                self.frame_loops[frame] = tracker.update(frame.f_lineno, self.frame_id(frame))
            self.record(frame, "line")
        elif event == "return":
            # A frame left by an exception is not a real return (arg is None).
            if self.limit is None and frame not in self.unwinding:
                self.frame_loops.pop(frame, None)
                self.record(frame, "return", return_value=arg)
            self.unwinding.discard(frame)
            self.trackers.pop(frame, None)
            self.frame_loops.pop(frame, None)
        elif event == "exception":
            exc = arg[1]
            self.unwinding.add(frame)
            if self.limit is None and not isinstance(exc, _Limit):
                self.record(
                    frame,
                    "exception",
                    exception={"name": type(exc).__name__, "message": str(exc), "line": frame.f_lineno},
                )
        return self.local_trace

    # -- run

    def run(self):
        trace = {"language": "python", "code": self.code, "steps": self.steps, "stdout": ""}
        try:
            compiled = compile(self.code, USER_FILE, "exec")
            self.loops = collect_loops(ast.parse(self.code))
        except SyntaxError as e:
            trace["error"] = {"name": type(e).__name__, "message": e.msg or str(e), "line": e.lineno or 1}
            return json.dumps(trace)

        user_builtins = dict(vars(builtins))
        user_builtins["input"] = self.input
        user_globals = {"__name__": "__main__", "__builtins__": user_builtins}
        old_stdout, old_stdin = sys.stdout, sys.stdin
        sys.stdout, sys.stdin = self.stdout, self.stdin
        sys.settrace(self.global_trace)
        try:
            exec(compiled, user_globals)
        except _Limit as e:
            trace["limitReached"] = e.kind
        except BaseException as e:  # noqa: BLE001 - report every user error
            if self.limit is not None:
                trace["limitReached"] = self.limit.kind
            else:
                trace["error"] = {"name": type(e).__name__, "message": str(e), "line": _error_line(e)}
        finally:
            self.stopped = True
            sys.settrace(None)
            sys.stdout, sys.stdin = old_stdout, old_stdin
        if self.limit is not None:
            trace["limitReached"] = self.limit.kind
        self.flush()
        trace["stdout"] = self.stdout.getvalue()
        return json.dumps(trace)


def _error_line(exc):
    line = 1
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == USER_FILE:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def run_trace(code, stdin="", max_steps=5000, timeout_ms=5000, max_output=100 * 1024, emit=None):
    return Tracer(code, stdin, max_steps, timeout_ms, max_output, emit).run()


# ---------------------------------------------------------------- CLI (VS Code extension)


def _main():
    """Read one RunRequest (JSON) from stdin; write WorkerMessages to stdout, one JSON per line."""
    out = open(sys.__stdout__.fileno(), "w", encoding="utf-8", closefd=False)

    def write(line):
        out.write(line + "\n")
        out.flush()

    # Steps and the trace are already JSON; splice them in instead of parsing them again.
    def emit(steps_json, stdout):
        write('{"type": "steps", "steps": %s, "stdout": %s}' % (steps_json, json.dumps(stdout)))

    # Before 3.10 (PEP 626) line events are unreliable, e.g. `while True:` reports no header line.
    if sys.version_info < (3, 10):
        write(json.dumps({
            "type": "fatal",
            "message": "CodeScope needs Python 3.10 or newer, but %s is Python %d.%d. Pick another interpreter."
            % (sys.executable, sys.version_info[0], sys.version_info[1]),
        }))
        return

    request = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    limits = request["limits"]
    # Let the program import modules that sit next to it, like `python file.py` would.
    cwd = request.get("cwd")
    if cwd:
        sys.path[0] = cwd
    tracer = Tracer(
        request["code"],
        request.get("stdin", ""),
        limits["maxSteps"],
        limits["timeoutMs"],
        limits["maxOutput"],
        emit,
    )
    # Also flush on a timer: if the program blocks (time.sleep, a socket), the extension kills
    # this process and still has the steps up to that point.
    lock = threading.Lock()
    flush = tracer.flush

    def locked_flush():
        with lock:
            flush()

    tracer.flush = locked_flush
    finished = threading.Event()

    def pump():
        while not finished.wait(0.25):
            locked_flush()

    threading.Thread(target=pump, daemon=True).start()
    write('{"type": "ready"}')
    trace = tracer.run()
    finished.set()
    with lock:
        write('{"type": "done", "trace": %s}' % trace)


if __name__ == "__main__":
    _main()
