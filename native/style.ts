// The look of the screens, HUD and touch buttons: the browser build's
// index.html <style>, rewritten class-based in tools/ui-style.css and
// converted once with `starhermit css` into assets/ui-style.json (`npm run
// css`), registered at start with the theme the runtime's own widgets
// (dialogs, scroll bars, check boxes) take. The old body.high-contrast
// palette is a token set applied while the runtime's high-contrast option is
// on (and, as before, the title drops its see-through wash for the panel).
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";

type Tokens = Record<string, string | number>;
let base: Tokens = {};
/** index.html body.high-contrast. */
const HIGH_CONTRAST: Tokens = {
  bg: "#000000", panel: "#000000ff", panel2: "#111111", text: "#ffffff", accent: "#00ffff", accent2: "#ff7ad9", gold: "#ffff00", edge: "#888888",
};

export function initStyles(): void {
  const css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  base = { ...(css.tokens as Tokens) };
  ui.setFont({ family: "sans-serif" });
  ui.setTheme({
    fontSize: 16, smallSize: 13.3, headingSize: 32, padding: 8, spacing: 14, radius: 10,
    text: "#e8f6ff", muted: "#9fb3c8", panel: "#0d1526", control: "#131f38", hovered: "#1a2a4a",
    pressed: "#0d1526", field: "#131f38", accent: "#22d3ee", focus: "#ffffff", outline: "#2c4066",
  });
  ui.setTokens(css.tokens);
  ui.setAnimations(css.animations);
  ui.setStyles({
    ...css.styles,
    label: { text: { color: "$text" } },
    paragraph: { text: { color: "$text" } },
    heading: { text: { color: "$text" } },
    widget: { focusRing: { color: "#ffffff", width: 3, offset: 2 } },
    scrollArea: { parts: { bar: { background: "#9fb3c8", radius: 4 } } },
    tooltip: { background: "$panel2", text: { color: "$text" }, radius: 6, padding: 6 },
  });
}

let hcKey: boolean | null = null;
/** The high-contrast tokens over the sheet's while the runtime's option is on. */
export function applyContrast(highContrast: boolean): void {
  if (hcKey === highContrast) return;
  hcKey = highContrast;
  ui.setTokens(highContrast ? { ...base, ...HIGH_CONTRAST } : base);
}
