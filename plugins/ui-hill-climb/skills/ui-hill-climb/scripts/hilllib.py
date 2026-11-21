"""Shared helpers for hill-climb's Kimi-backed scripts."""
import glob
import json
import os
import re
import sys
from collections.abc import Callable

DEFAULT_MODEL = "kimi-code/k3.1-pro"


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
