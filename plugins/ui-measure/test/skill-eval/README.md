# skill-eval fixture

Inputs for the ui-measure skill evaluation (trigger and behaviour tests).

- `notice-card.json`: a design node in the Figma REST shape (node `10:1`, a 320x160 card with a heading and a body text).
- `page.html`: a static page that builds the card with two planted defects: padding 32px where the design says 24px, and no drop shadow. Serve this folder (`python3 -m http.server`) and open `page.html`.
- `font.ttf`: the font the page loads as Inter.
- `notice-card-dismiss.json`: the same node plus a 24x24 `Dismiss icon` (10:4) that `page.html` does not build. Used by the second behaviour case, where the agent must name the unbuilt node and why it cannot be compared.
