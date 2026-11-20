#!/bin/bash
# usage: repo-meta.sh owner/repo ... ; saves sources/repo-<owner>-<repo>.json and prints one line
D="$(cd "$(dirname "$0")/.." && pwd)/sources"
for r in "$@"; do n=$(echo $r|tr / -); gh api repos/$r > "$D/repo-$n.json" 2>/dev/null; rc=$?
printf '%s\t%s\trepo-%s\thttps://github.com/%s\n' "$(date -u +%F)" "$rc" "$n" "$r" >> "$D/fetch-log.tsv"
python3 -I -c "
import json,sys
try:
  d=json.load(open('$D/repo-$n.json')); print('$r',d['stargazers_count'],'pushed',d['pushed_at'][:10],'created',d['created_at'][:10],'issues',d['open_issues_count'],'archived',d['archived'],'|',(d['description'] or '')[:100])
except Exception as e: print('$r FAIL',e)"
done
