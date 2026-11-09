# Builds the S13-C3 replay bundles from OOOCV's tree. The bundles hold OOOCV's
# code, so they stay outside this repo; only this script and the results are kept.
import os, sys
tree, diff, out = sys.argv[1], sys.argv[2], sys.argv[3]
files = [l[6:].strip() for l in open(diff, encoding="utf-8") if l.startswith("+++ b/")]
files = [f for f in files if os.path.exists(os.path.join(tree, f))]
parts = [("diff.patch", open(diff, encoding="utf-8").read())]
parts += [(f, open(os.path.join(tree, f), encoding="utf-8").read()) for f in files]
def write(name, chunk):
    body = "".join(f"\n\n===== FILE: {n} =====\n{t}" for n, t in chunk)
    body += f"\n\n===== END OF BUNDLE {name} — SENTINEL {name.upper()}-7Q4 =====\n"
    os.makedirs(os.path.join(out, name), exist_ok=True)
    open(os.path.join(out, name, "bundle.md"), "w", encoding="utf-8").write(body)
    print(name, len(body.encode()), "bytes", len(chunk), "parts")
write("full", parts)
total = sum(len(t.encode()) for _, t in parts); acc = 0; cut = 0
for i, (_, t) in enumerate(parts):
    acc += len(t.encode())
    if acc >= total / 2: cut = i + 1; break
write("halfA", parts[:cut]); write("halfB", parts[cut:])
