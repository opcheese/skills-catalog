#!/bin/bash
# usage: gh-save.sh <slug> <owner/repo> <number>  -> saves issue + comments JSON, card, and a text digest
D="$(cd "$(dirname "$0")/.." && pwd)/sources"; slug=$1; repo=$2; n=$3
gh api "repos/$repo/issues/$n" > "$D/$slug.raw" 2>"$D/$slug.err"; rc=$?
gh api "repos/$repo/issues/$n/comments?per_page=100" > "$D/$slug.comments.json" 2>>"$D/$slug.err"
python3 -I - "$D/$slug" <<'PY'
import json,sys
p=sys.argv[1]
i=json.load(open(p+'.raw')); c=json.load(open(p+'.comments.json'))
t=f"{i['title']}\n{i['user']['login']} {i['created_at']} state={i['state']}\n\n{i['body'] or ''}\n"
for x in c: t+=f"\n--- {x['user']['login']} {x['created_at']}\n{x['body']}\n"
open(p+'.txt','w').write(t)
PY
sha=$(sha256sum "$D/$slug.raw"|cut -d' ' -f1)
printf '{"url":"https://github.com/%s/issues/%s","fetched":"%s","http_status":"%s","sha256":"%s"}\n' "$repo" "$n" "$(date -u +%F)" "$([ $rc = 0 ] && echo 200 || echo fail)" "$sha" > "$D/$slug.card.json"
printf '%s\t%s\t%s\thttps://github.com/%s/issues/%s\n' "$(date -u +%F)" "$rc" "$slug" "$repo" "$n" >> "$D/fetch-log.tsv"
