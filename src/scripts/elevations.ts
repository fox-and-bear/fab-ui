/**
 * Updates live shadow values on elevation token cards
 */
function updateLiveValues() {
  const cards = document.querySelectorAll<HTMLElement>(".token-card");

  cards.forEach((card) => {
    const tokenName = card.dataset.token;
    const currentEl = card.querySelector<HTMLElement>(".token-current");

    if (!currentEl) return;

    try {
      const boxEl = card.querySelector<HTMLElement>(".shadow-box");
      if (!boxEl) return;
      const shadow = window.getComputedStyle(boxEl).boxShadow;

      if (shadow && shadow !== "none") {
        const match = shadow.match(/([0-9.]+)px\s+([0-9.]+)px\s+([0-9.]+)px?\s*([0-9.]+px)?/);
        if (match) {
          const x = parseFloat(match[1]);
          const y = parseFloat(match[2]);
          const blur = parseFloat(match[3]);
          currentEl.textContent = `· ${x}px ${y}px blur ${blur}px`;
        } else {
          currentEl.textContent = `· ${shadow.substring(0, 40)}...`;
        }
      } else {
        currentEl.textContent = `· no shadow`;
      }
    } catch (err) {
      console.warn(`Could not compute shadow for ${tokenName}:`, err);
      currentEl.textContent = `· unavailable`;
    }
  });
}

// Debounced resize listener
let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(updateLiveValues, 100);
});

/**
 * Public initializer for the elevation page
 */
export function initElevationUpdates() {
  // Initial run
  requestAnimationFrame(updateLiveValues);
  // Re-run after fonts load
  document.fonts.ready.then(() => requestAnimationFrame(updateLiveValues));
}

// Auto-init if loaded directly (for non-Astro pages)
if (typeof window !== "undefined" && typeof document !== "undefined") {
  // Only auto-init if not called from another module
  if (!document.currentScript || document.currentScript.tagName !== "SCRIPT") {
    initElevationUpdates();
  }
}
