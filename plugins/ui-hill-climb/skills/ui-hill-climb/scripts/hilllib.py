"""Shared helpers for hill-climb's model-backed scripts."""
import glob
import json
import os
import re
import shlex
import subprocess
import sys
from collections.abc import Callable

DEFAULT_MODEL = "kimi-code/k3.1-pro"
RUNNERS = ("kimi", "claude", "codex", "command")


def die(code, msg):
    print(f"hill-judge: {msg}", file=sys.stderr)
    sys.exit(code)


def find_delegate() -> str:
    explicit = os.environ.get("HILL_KIMI_DELEGATE")
    if explicit:
        return explicit
    roots = [os.environ.get("KIMI_DELEGATION_ROOT")] if os.environ.get("KIMI_DELEGATION_ROOT") else []
    roots += sorted(glob.glob(os.path.expanduser("~/.claude/plugins/cache/*/kimi-delegation/*")),
                    key=lambda p: [int(x) if x.isdigit() else 0 for x in re.split(r"[.]", os.path.basename(p))])[::-1]
    for root in roots:
        skill = os.path.join(root, "skills", "delegating-to-kimi")
        script = os.path.join(skill, "scripts", "kimi-delegate")
        agent = os.path.join(skill, "agents", "delegate-readonly.md")
        if os.path.isfile(script):
            if "ReadMediaFile" not in open(agent).read():
                die(2, f"{root}: kimi-delegation's read-only agent can't view images; update to >= 1.3.2")
            return script
    die(2, "kimi-delegation is not installed (or set HILL_KIMI_DELEGATE)")


def runner_name() -> str:
    name = os.environ.get("HILL_RUNNER") or "kimi"
    if name not in RUNNERS:
        die(2, f"unknown HILL_RUNNER {name!r}: use one of " + ", ".join(RUNNERS))
    return name


def requested_model() -> str:
    """The model name recorded with a judgement: Kimi's default only on the kimi runner."""
    explicit = os.environ.get("HILL_JUDGE_MODEL")
    if explicit:
        return explicit
    return DEFAULT_MODEL if runner_name() == "kimi" else "default"


def run_model(prompt: str, workdir: str, images: list[str], model: str) -> tuple[int, str, str]:
    """Send one prompt to the model chosen by HILL_RUNNER.

    Returns (exit code, stdout, provenance line). On a nonzero exit the runner's stderr has
    been copied to ours. Only the kimi runner can return 75 (quota): any other failure is 1.
    """
    runner = runner_name()
    if runner == "kimi":
        delegate = find_delegate()
        p = subprocess.run([delegate, "--via", "kimi", "--final-only", "--cwd", workdir, "--", prompt],
                           capture_output=True, text=True, env=dict(os.environ, KIMI_DELEGATE_MODEL=model))
        prov = next((l for l in p.stderr.splitlines() if l.startswith("kimi-delegate:")), "")
        if p.returncode != 0:
            sys.stderr.write(p.stderr)
        return p.returncode, p.stdout, prov

    explicit = bool(os.environ.get("HILL_JUDGE_MODEL"))  # DEFAULT_MODEL is a Kimi name: never pass it on
    if runner == "claude":
        argv = ["claude", "-p", "--allowedTools", "Read", "--output-format", "text"]
        if explicit:
            argv += ["--model", model]
    elif runner == "codex":
        argv = ["codex", "exec", "--skip-git-repo-check"]
        for image in images:
            argv += ["-i", os.path.abspath(image)]
        if explicit:
            argv += ["-m", model]
    else:
        cmd = os.environ.get("HILL_RUNNER_CMD", "")
        try:
            argv = shlex.split(cmd)
        except ValueError as e:
            die(2, f"HILL_RUNNER_CMD: {e}")
        if not argv:
            die(2, "HILL_RUNNER=command needs HILL_RUNNER_CMD (an argv that reads the prompt on stdin)")
    prov = f"runner={runner} model={model if explicit else 'default'} cmd={argv[0]}"
    try:
        p = subprocess.run(argv, input=prompt, capture_output=True, text=True, cwd=workdir)
    except OSError as e:
        sys.stderr.write(f"could not launch {argv[0]!r}: {e}\n")
        return 1, "", prov
    if p.returncode != 0:
        sys.stderr.write(p.stderr)
        return 1, p.stdout, prov
    return 0, p.stdout, prov


def first_json(text: str, accept: Callable[[dict], bool]) -> dict | None:
    dec = json.JSONDecoder()
    for m in re.finditer(r"\{", text):
        try:
            obj, _ = dec.raw_decode(text[m.start():])
        except ValueError:
            continue
        if isinstance(obj, dict) and accept(obj):
            return obj
    return None


def load_measure(run_dir: str) -> dict | None:
    path = os.path.join(run_dir, "measure.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"{path}: invalid JSON: {e.msg}", file=sys.stderr)
        sys.exit(2)
    except OSError as e:
        print(f"{path}: {e}", file=sys.stderr)
        sys.exit(2)
    if not isinstance(data, dict):
        print(f"{path}: must contain a JSON object", file=sys.stderr)
        sys.exit(2)
    unknown = set(data) - {"config", "screens"}
    if unknown:
        print(f"{path}: unknown key {sorted(unknown)[0]!r}", file=sys.stderr)
        sys.exit(2)
    if not isinstance(data.get("config"), str) or not data["config"]:
        print(f"{path}: config must be a non-empty string", file=sys.stderr)
        sys.exit(2)
    screens = data.get("screens")
    if not isinstance(screens, dict):
        print(f"{path}: screens must be an object", file=sys.stderr)
        sys.exit(2)
    for label, screen in screens.items():
        if not isinstance(screen, dict):
            print(f"{path}: screen {label!r} must be an object", file=sys.stderr)
            sys.exit(2)
        unknown = set(screen) - {"target", "figma", "node", "proposal"}
        if unknown:
            print(f"{path}: screen {label!r} has unknown key {sorted(unknown)[0]!r}", file=sys.stderr)
            sys.exit(2)
        if not isinstance(screen.get("target"), str) or not screen["target"]:
            print(f"{path}: screen {label!r} target must be a non-empty string", file=sys.stderr)
            sys.exit(2)
        if "figma" in screen and "node" in screen:
            print(f"{path}: screen {label!r} gives both figma and node; they are mutually exclusive", file=sys.stderr)
            sys.exit(2)
        for key in ("figma", "node", "proposal"):
            if key in screen and (not isinstance(screen[key], str) or not screen[key]):
                print(f"{path}: screen {label!r} {key} must be a non-empty string", file=sys.stderr)
                sys.exit(2)
    return data


def find_ui_measure() -> str:
    explicit = os.environ.get("HILL_UI_MEASURE")
    if explicit:
        return explicit
    paths = glob.glob(os.path.expanduser("~/.claude/plugins/cache/*/ui-measure/*/dist/ui-measure.mjs"))

    def version_key(path):
        version = os.path.basename(os.path.dirname(os.path.dirname(path)))
        return [int(x) if x.isdigit() else 0 for x in re.split(r"[.]", version)]

    if paths:
        return sorted(paths, key=version_key)[-1]
    die(2, "install the ui-measure plugin, or set HILL_UI_MEASURE")
