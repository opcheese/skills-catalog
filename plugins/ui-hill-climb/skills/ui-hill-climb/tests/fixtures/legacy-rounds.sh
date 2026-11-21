# Sourced by test-score-measured.sh. Builds judge-only runs (no measure.json) for the
# 0.1.3 back-compat goldens in this directory. Do not change what these write: the goldens
# were produced by the 0.1.3 hill-score from exactly these inputs.

legacy_mk() { # legacy_mk ROUNDDIR LABEL RUN SCORE [ELEMENT]
  mkdir -p "$1"
  python3 - "$1/$2.run$3.json" "$4" "${5:-Primary button}" "$2" <<'PY'
import json,sys
p,s,el,label=sys.argv[1],float(sys.argv[2]),sys.argv[3],sys.argv[4]
cats=["hierarchy","typography","colour","spacing","consistency","originality"]
json.dump({"label":label,"image":label+".png","sha256":"ab"*32,"model_requested":"kimi-code/k3.1-pro",
  "provenance":"served=unconfirmed","scores":{c:s for c in cats},
  "findings":[{"category":"spacing","element":el,"problem":"cramped","severity":"major","region":{"x":1,"y":2,"w":3,"h":4}}]},open(p,"w"))
PY
}

legacy_mkd() { # legacy_mkd FILE LABEL SCORE SEVERITY
  python3 - "$@" <<'PY'
import json,sys
p,label,s,sev=sys.argv[1],sys.argv[2],float(sys.argv[3]),sys.argv[4]
cats=["hierarchy","typography","colour","spacing","consistency","originality"]
f=[] if sev=="none" else [{"category":"colour","element":"Primary button","problem":"flat fill, design has a gradient","severity":sev,"region":{"x":224,"y":1314,"w":632,"h":52}}]
json.dump({"label":label,"mode":"design","image":label+".png","sha256":"ef"*32,"design":{"path":"/d/figma.png","sha256":"12"*32},
  "model_requested":"kimi-code/k3.1-pro","provenance":"","scores":{c:s for c in cats},"findings":f},open(p,"w"))
PY
}

build_legacy_rounds() { # three reference-mode rounds, round 2 addresses round 1's finding
  local R="$1" fid
  fid=$(python3 -c 'import hashlib;print("F-"+hashlib.sha1(b"home|spacing|primary button").hexdigest()[:8])')
  legacy_mk "$R/round-1" home 1 5; legacy_mk "$R/round-1" home 2 5; legacy_mk "$R/round-1" ref-home 1 7; legacy_mk "$R/round-1" ref-home 2 7
  legacy_mk "$R/round-2" home 1 6; legacy_mk "$R/round-2" home 2 6; legacy_mk "$R/round-2" ref-home 1 7; legacy_mk "$R/round-2" ref-home 2 7
  cat > "$R/round-2/changes.json" <<EOT
[{"id":"C-1","screen":"home","before":"round-1/home.png","after":"round-2/home.png","after_size":{"w":4,"h":3},
  "region":{"x":1,"y":2,"w":3,"h":4},"rationale":"more padding","categories":["spacing"],"addresses":["$fid"]}]
EOT
  legacy_mk "$R/round-3" home 1 5.5; legacy_mk "$R/round-3" home 2 5.5; legacy_mk "$R/round-3" ref-home 1 7.2; legacy_mk "$R/round-3" ref-home 2 7.2
}

build_legacy_design() { # one design-mode round
  mkdir -p "$1/round-1"
  legacy_mkd "$1/round-1/login.run1.json" login 8 major
  legacy_mkd "$1/round-1/ref-figma.run1.json" ref-figma 5 none
}
