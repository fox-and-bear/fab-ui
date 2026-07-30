/**
 * Copies text to clipboard with visual feedback
 * @param {string} text - The text to copy
 * @param {HTMLElement} triggerEl - The element that was clicked (for feedback)
 */
export function copyToClipboard(text: string, triggerEl: HTMLElement) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showCopyFeedback(triggerEl, "Copied!", "success");
    })
    .catch((err) => {
      console.error("Copy failed:", err);
      showCopyFeedback(triggerEl, "Failed", "error");
    });
}

/**
 * Shows temporary feedback on the clicked element
 * @param {HTMLElement} el - Element to show feedback on
 * @param {string} message - Message to display
 * @param {'success' | 'error'} type - Feedback type
 */
function showCopyFeedback(el: HTMLElement, message: string, type: "success" | "error" = "success") {
  const originalText = el.textContent;

  // Add class for styling + set temporary text
  el.classList.add(type);
  el.textContent = message;

  // Restore after 1.5 seconds
  setTimeout(() => {
    el.classList.remove(type);
    el.textContent = originalText;
  }, 1500);
}

/**
 * Swatch cell copy — uses CSS class toggle for ::after overlay
 */
function copyFromSwatch(variable: string, cellEl: HTMLElement) {
  navigator.clipboard
    .writeText(variable)
    .then(() => {
      cellEl.classList.add("copied");
      setTimeout(() => cellEl.classList.remove("copied"), 1500);
    })
    .catch((err) => console.error("Copy failed:", err));
}

/**
 * Attaches click listeners to all copyable elements
 * Call this AFTER rendering the HTML
 */
export function initCopyToken() {
  // Code elements inside token cards
  document.querySelectorAll<HTMLElement>(".token-card code").forEach((codeEl) => {
    codeEl.style.cursor = "pointer";
    codeEl.title = "Click to copy CSS variable";
    codeEl.addEventListener("click", function () {
      copyToClipboard(this.textContent ?? "", this);
    });
  });

  // Swatch cells
  document.querySelectorAll<HTMLElement>(".swatch-cell").forEach((cell) => {
    const variable = cell.dataset.var;
    if (variable) {
      cell.title = "Click to copy CSS variable";
      cell.addEventListener("click", () => {
        copyFromSwatch(variable, cell);
      });

      const swatch = cell.querySelector<HTMLDivElement>(".swatch");
      if (swatch) swatch.style.cursor = "pointer";
    }
  });
}
