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
