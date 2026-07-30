/**
 * Updates live values on spacing and radius token cards
 * Reads computed inline-size for spacing, border-radius for radii
 */
function updateLiveValues() {
  const cards = document.querySelectorAll<HTMLElement>(".token-card");

  cards.forEach((card) => {
    const type = card.dataset.type;
    const tokenName = card.dataset.token;
    const currentEl = card.querySelector<HTMLElement>(".token-current");

    if (!currentEl) return;

    let computedValue = "0px";

    try {
      if (type === "spacing") {
        // Read from the padding-block which has inline-size applied
        const padEl = card.querySelector<HTMLElement>(".padding-block");
        if (padEl) {
          computedValue = window.getComputedStyle(padEl).inlineSize || "0px";
        }
      } else if (type === "radii") {
        // Read from the radii-swatch which has border-radius applied
        const swatchEl = card.querySelector<HTMLElement>(".radii-swatch");
        if (swatchEl) {
          computedValue = window.getComputedStyle(swatchEl).borderTopLeftRadius || "0px";
        }
      }
    } catch (err) {
      console.warn(`Could not compute value for ${tokenName}:`, err);
    }

    currentEl.textContent = `· currently ${computedValue}`;
  });
}

// Debounced resize listener for responsive spacings
let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(updateLiveValues, 100);
});

/**
 * Public initializer for the spacing page
 */
export function initSpacingUpdates() {
  // Initial run
  requestAnimationFrame(updateLiveValues);
  // Re-run after fonts load (helps with rem-based clamps)
  if (typeof document !== "undefined") {
    document.fonts.ready.then(() => requestAnimationFrame(updateLiveValues));
  }
}

// Auto-init guard (remove this for pure module usage)
if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (!document.currentScript || document.currentScript.tagName !== "SCRIPT") {
    initSpacingUpdates();
  }
}
