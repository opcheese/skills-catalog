#!/usr/bin/env bash
set -euo pipefail

branch="${1:-feat/ui-measure}"
mkdir -p /tmp/ui-measure-scratch
work_dir="$(mktemp -d /tmp/ui-measure-scratch/path-dep.XXXXXX)"
cd "$work_dir"

pnpm init
pnpm add "git+https://github.com/opcheese/skills-catalog.git#${branch}&path:plugins/ui-measure"
node -e "import('ui-measure/version').then(({ VERSION }) => console.log(VERSION))"
