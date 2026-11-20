#!/bin/bash
# usage: hn-save.sh <id> -> saves Algolia item JSON + flattened text
D="$(cd "$(dirname "$0")/.." && pwd)/sources"; id=$1
scripts_dir="$(dirname "$0")"
"$scripts_dir/save.sh" hn-$id "https://hn.algolia.com/api/v1/items/$id" >/dev/null
python3 -I - "$D/hn-$id" <<'PY'
import json,sys,re,html
p=sys.argv[1]; d=json.load(open(p+'.raw'))
out=[]
def w(n,depth=0):
    t=re.sub(r'<[^>]+>',' ',html.unescape(n.get('text') or '')) 
    out.append('  '*depth+f"[{n.get('author')}] {n.get('title') or ''} {t}")
    for c in n.get('children',[]): w(c,depth+1)
w(d); open(p+'.txt','w').write('\n'.join(out))
PY
echo hn-$id $(wc -c < "$D/hn-$id.txt")
