#!/bin/bash
# usage: save.sh <slug> <url>  -> sources/<slug>.raw, .txt, .card.json ; appends sources/fetch-log.tsv
D="$(cd "$(dirname "$0")/.." && pwd)/sources"; slug="$1"; url="$2"
hdr="$D/$slug.headers"
code=$(curl -sSL -m 60 -A "Mozilla/5.0 research-fetch" -D "$hdr" -o "$D/$slug.raw" -w '%{http_code}' "$url" 2>"$D/$slug.err"); 
sha=$(sha256sum "$D/$slug.raw" | cut -d' ' -f1)
python3 -I - "$D/$slug.raw" "$D/$slug.txt" <<'PY'
import sys,re,html
d=open(sys.argv[1],'rb').read().decode('utf8','replace')
if '<html' in d[:3000].lower() or '<body' in d.lower():
    d=re.sub(r'(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>','',d)
    d=re.sub(r'(?s)<[^>]+>','\n',d); d=html.unescape(d); d=re.sub(r'\n\s*\n+','\n',d)
open(sys.argv[2],'w').write(d)
PY
printf '{"url":"%s","fetched":"%s","http_status":"%s","sha256":"%s"}\n' "$url" "$(date -u +%F)" "$code" "$sha" > "$D/$slug.card.json"
printf '%s\t%s\t%s\t%s\n' "$(date -u +%F)" "$code" "$slug" "$url" >> "$D/fetch-log.tsv"
echo "$slug $code $(wc -c <"$D/$slug.raw")"
