# Figma notes for ui-measure

Project facts the measuring skill reads before it compares a screen with its design.
Fill in what applies and delete the rest. Keep it to facts; no secrets.

## Figma file and pages

- File: `<file key>` (<file name>)
- Pages that hold the designs to measure: `<page name>`, `<page name>`
- Naming of frames: <for example "Screen / State / Breakpoint">

## Tokens and theme fields

- Where design tokens live in code: `<path>`
- Figma variable collections and the theme field each maps to: `<collection>` -> `<theme field>`
- Colours that are never literal in code: <for example "text uses the foreground token">

## Fonts

- Families used in the design and the font file or package that supplies each in code
- Weights and their numeric values: <for example "Semi Bold = 600">

## Component folders

- Shared components: `<path>`
- Screens or pages: `<path>`
- Figma component name to code component: `<Figma name>` -> `<code name>`

## Viewport and device

- Design width and height per frame: `<width>` x `<height>`
- Device scale factor the design assumes: <1 or 2>
- Breakpoints worth measuring: <widths>

## Recurring review defects

Differences reviewers keep finding between design and build:

- <for example "card padding is 16 in code, 24 in the design">

## How to reach each screen state

For each state a frame shows: the URL, the mock data it needs, and the steps to reach it.

- `<state name>`: URL `<path>`; mock `<mock name>`; steps: <click, type, wait>
