// Report shapes, copied from docs/superpowers/specs/2026-11-20-ui-measure-design.md ("Data shapes").

export type Status = "pass" | "fail" | "not_comparable"

export interface Finding {
  check: "geometry" | "spec"
  kind: string // e.g. "clipped", "gap", "radius", "token"
  status: Status
  origin?: "introduced" | "inherited" // only when a baseline exists
  target: { selector: string; designNode?: string; text?: string }
  expected?: string
  actual?: string
  deltaPx?: number
  reason?: string // required when not_comparable
}

export interface Report {
  tool: "ui-measure"
  version: string
  ranAt: string
  page: { url: string; viewport: [number, number]; screen: [number, number]; dpr: number }
  scale: number // CSS px per design px, from the live root font size
  findings: Finding[]
  coverage: { pairsProposed: number; pairsAccepted: number; dropped: number; authoritative: boolean }
  verdict: "clean" | "mismatches" | "not_comparable"
}
