// fab-select.js
/**
 * FabSelect - Searchable select/multi-select web component (v2.0 Refactored)
 *
 * Styling:
 *   1. CSS custom properties (see :host block below for the full list + defaults)
 *   2. Shadow parts via ::part() — e.g. fab-select::part(trigger) { ... }
 *
 * Both can be combined. Custom properties cascade through the shadow boundary
 * automatically; ::part() gives direct access to individual sub-elements.
 *
 * @version 2.0.0-refactored
 * @last-modified 2026-07-27
 */

class FabSelect extends HTMLElement {
  // =====================
  // STATIC PROPERTIES
  // =====================

  /**
   * Standard event types dispatched by FabSelect
   * @enum {string}
   */
  static get EVENT_TYPES() {
    return {
      CHANGE: "change",
      INPUT: "input",
      OPEN: "open",
      CLOSE: "close",
      LOADSTART: "loadstart",
      LOADEND: "loadend",
      ERROR: "error",
    };
  }

  /**
   * Attributes that trigger re-rendering when changed
   * @type {string[]}
   */
  static get OBSERVED_ATTRIBUTES() {
    return ["mode", "placeholder", "disabled", "async-url", "name", "required"];
  }

  static get observedAttributes() {
    return FabSelect.OBSERVED_ATTRIBUTES;
  }

  // =====================
  // CONSTRUCTOR
  // =====================

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });

    // State management
    this._isOpen = false;
    this._searchQuery = "";
    this._selectedValues = [];
    this._options = [];
    this._groups = [];
    this._isLoading = false;
    this._isFetching = false;
    this._error = null;
    this._debounceTimer = null;
    this._abortController = null;
    this._formElement = null;
    this._customError = null;

    // Caches for performance
    this._elements = {};
    this._filteredOptionsCache = null;

    // Bound event handlers (prevents memory leaks)
    this._handleClickOutsideBound = null;
    this._handleScrollOutsideBound = null;
    this._handleTriggerKeydownBound = null;
    this._handleOptionsKeydownBound = null;
    this._handleSearchKeydownBound = null;
  }

  // =====================
  // LIFE CYCLE CALLBACKS
  // =====================

  connectedCallback() {
    this._render();
    this._cacheElements();
    this._updateDisplay();
    this._loadInitialOptions();
    this._setupEventListeners();
    this._checkFormAssociation();

    if (this.asyncUrl) {
      this.loadAsync();
    }
    // DEBUG
    console.log("[FabSelect] Debug:");
    console.log("- shadowRoot:", !!this._shadow);
    console.log("- elements cached:", Object.keys(this._elements));
    console.log("- trigger exists:", !!this._trigger);
    console.log("- dropdown exists:", !!this._dropdown);
  }

  disconnectedCallback() {
    this._cleanup();
    // All cleanup handled in _cleanup() - no duplicates needed
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      if (name === "mode") {
        this._resetSelection();
      }
      if (name === "async-url") {
        this.asyncUrl = newValue;
      }
      this._render();
    }
  }

  // =====================
  // ATTRIBUTE HELPERS
  // =====================

  /**
   * Get attribute value with fallback
   * @param {string} name - Attribute name
   * @param {*} fallback - Default value if not set
   * @returns {*} Attribute value or fallback
   */
  _getAttr(name, fallback = null) {
    return this.getAttribute(name) ?? fallback;
  }

  /**
   * Gets or sets the selection mode (single or multi)
   * @type {"single"|"multi"}
   */
  get mode() {
    return this._getAttr("mode", "single");
  }

  set mode(value) {
    const validModes = ["single", "multi"];
    if (!validModes.includes(value)) {
      console.warn(
        `[FabSelect] Invalid mode "${value}", expected "single" or "multi", using "single"`,
      );
      value = "single";
    }
    this.setAttribute("mode", value);
    this._selectedValues = [];
    this._notifyFormChange();
  }

  /**
   * Placeholder text when no selection exists
   * @type {string}
   */
  get placeholder() {
    return this._getAttr("placeholder", "Select option");
  }

  /**
   * Whether the component is disabled
   * @type {boolean}
   */
  get disabled() {
    return this.hasAttribute("disabled");
  }

  /**
   * Whether the field is required
   * @type {boolean}
   */
  get required() {
    return this.hasAttribute("required");
  }

  set required(value) {
    if (value) {
      this.setAttribute("required", "");
    } else {
      this.removeAttribute("required");
    }
    this._validate();
  }

  /**
   * URL for async option loading
   * @type {string|null}
   */
  get asyncUrl() {
    return this._getAttr("async-url", null);
  }

  set asyncUrl(value) {
    if (value) {
      this.setAttribute("async-url", value);
    } else {
      this.removeAttribute("async-url");
    }
  }

  /**
   * Additional params sent with async requests
   * @type {Object}
   */
  get asyncParams() {
    const val = this.getAttribute("async-params");
    try {
      return val ? JSON.parse(val) : {};
    } catch {
      return {};
    }
  }

  /**
   * Milliseconds to wait before triggering search
   * @type {number}
   */
  get searchDebounce() {
    return parseInt(this.getAttribute("search-debounce")) || 300;
  }

  /**
   * Whether to load options when dropdown opens (for async mode)
   * @type {boolean}
   */
  get loadOnOpen() {
    return this.hasAttribute("load-on-open");
  }

  // =====================
  // PUBLIC API — CORE
  // =====================

  /**
   * Returns current selection(s)
   * @returns {string|null|string[]} Single value for single mode, array for multi mode
   * @public
   */
  getValue() {
    return this.mode === "single" ? this._selectedValues[0] || null : [...this._selectedValues];
  }

  /**
   * Sets the selected value(s)
   * @param {string|string[]} value - Single value for single mode, array for multi mode
   * @public
   */
  setValue(value) {
    // Clear any pending operations
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    // Normalize input early
    const normalizedValue =
      this.mode === "single"
        ? value != null && value !== ""
          ? [String(value)]
          : []
        : Array.isArray(value)
          ? value.map((v) => String(v))
          : [];

    // Early exit if unchanged
    if (JSON.stringify(this._selectedValues) === JSON.stringify(normalizedValue)) {
      return;
    }

    this._selectedValues = normalizedValue;
    this._updateDisplay();
    this._renderOptions();
    this._dispatchChangeEvent();
    this._notifyFormChange();
  }

  /**
   * Returns all available options
   * @returns {{value:string, label:string, disabled:boolean, group:string|null}[]}
   * @public
   */
  getOptions() {
    return this._options.map((opt) => ({
      value: opt.value,
      label: opt.label,
      disabled: opt.disabled,
      group: opt.group,
    }));
  }

  /**
   * Replaces all options with the provided array
   * @param {{value:string, label:string, disabled?:boolean, group?:string}[]} options
   * @public
   */
  setOptions(options) {
    // Validate and normalize options
    const validatedOptions = options
      .filter((opt) => opt && typeof opt.value !== "undefined" && typeof opt.label !== "undefined")
      .map((opt, idx) => ({
        value: String(opt.value),
        label: String(opt.label),
        disabled: !!opt.disabled,
        group: opt.group != null ? String(opt.group) : null,
        id: `fab-option-${Date.now()}-${idx}`,
      }));

    if (validatedOptions.length !== options.length) {
      console.warn(
        `[FabSelect] ${options.length - validatedOptions.length} invalid options discarded`,
      );
    }

    this._options = validatedOptions;
    this._groups = [...new Set(this._options.filter((o) => o.group).map((o) => o.group))];
    this._renderOptions();
    this._updateDisplay();
    this._validate();
  }

  /**
   * Adds a single option to the list
   * @param {{value:string, label:string, disabled?:boolean, group?:string}} option
   * @public
   */
  addOption(option) {
    const newOpt = {
      value: String(option.value),
      label: option.label,
      disabled: option.disabled || false,
      group: option.group || null,
      id: `fab-option-${Date.now()}`,
    };
    this._options.push(newOpt);
    this._groups = [...new Set(this._options.filter((o) => o.group).map((o) => o.group))];
    this._renderOptions();
  }

  /**
   * Removes an option by its value
   * @param {string} value - The value of the option to remove
   * @public
   */
  removeOption(value) {
    this._options = this._options.filter((opt) => opt.value !== String(value));
    this._selectedValues = this._selectedValues.filter((v) => v !== String(value));
    this._groups = [...new Set(this._options.filter((o) => o.group).map((o) => o.group))];
    this._renderOptions();
    this._updateDisplay();
  }

  // =====================
  // PUBLIC API — ASYNC
  // =====================

  /**
   * Loads options from async URL
   * @param {Object} params - Additional query params
   * @param {boolean} append - Whether to append or replace existing options
   * @returns {Promise<void>}
   * @public
   */
  async loadAsync(params = {}, append = false) {
    if (!this.asyncUrl) {
      throw new Error("[FabSelect] async-url attribute is required for loadAsync()");
    }
    await this._fetchOptions(params, append);
  }

  /**
   * Refreshes options from the async URL
   * @returns {Promise<void>}
   * @public
   */
  refreshAsync() {
    return this.loadAsync({}, false);
  }

  /**
   * Returns whether async loading is in progress
   * @returns {boolean}
   * @public
   */
  isLoading() {
    return this._isLoading || this._isFetching;
  }

  // =====================
  // PUBLIC API — GROUPS
  // =====================

  /**
   * Returns all group names
   * @returns {string[]}
   * @public
   */
  getGroups() {
    return this._groups;
  }

  /**
   * Adds a new group with options
   * @param {string} name - Group name
   * @param {{value:string, label:string, disabled?:boolean}[]} options - Options to add
   * @public
   */
  addGroup(name, options = []) {
    if (!this._groups.includes(name)) {
      this._groups.push(name);
    }
    const newOptions = options.map((opt, idx) => ({
      value: String(opt.value),
      label: opt.label,
      disabled: opt.disabled || false,
      group: name,
      id: `fab-option-${Date.now()}-${idx}`,
    }));
    this._options.push(...newOptions);
    this._renderOptions();
  }

  /**
   * Removes all options in a group
   * @param {string} name - Group name to remove
   * @public
   */
  removeGroup(name) {
    this._options = this._options.filter((opt) => opt.group !== name);
    this._groups = this._groups.filter((g) => g !== name);
    this._selectedValues = this._selectedValues.filter((v) => {
      const opt = this._options.find((o) => o.value === v);
      return opt && opt.group !== name;
    });
    this._renderOptions();
    this._updateDisplay();
  }

  // =====================
  // PUBLIC API — FORM
  // =====================

  /**
   * Reports validity and shows validation messages
   * @returns {boolean}
   * @public
   */
  reportValidity() {
    return this._validate();
  }

  /**
   * Checks validity without showing messages
   * @returns {boolean}
   * @public
   */
  checkValidity() {
    return this._validate(true);
  }

  /**
   * Sets custom validity error message
   * @param {string|null} message - Error message or null to clear
   * @public
   */
  setCustomValidity(message) {
    this._customError = message || null;
    this._validate();
  }

  // =====================
  // PUBLIC METHODS — UI CONTROL
  // =====================

  /**
   * Opens the dropdown
   * @public
   */
  open() {
    if (this.disabled) return;
    this._isOpen = true;
    this.setAttribute("aria-expanded", "true");
    //   this._renderOptions();
    if (
      this._options.length > 0 &&
      (!this._elements.optionsList || this._elements.optionsList.innerHTML === "")
    ) {
      this._renderOptions();
    }
    this._dropdown.classList.add("open");
    this._trigger.focus();
    this.dispatchEvent(new CustomEvent(FabSelect.EVENT_TYPES.OPEN));
  }

  /**
   * Closes the dropdown
   * @public
   */
  close() {
    this._isOpen = false;
    this.removeAttribute("aria-expanded");
    this._dropdown.classList.remove("open");

    // Clear focus from options
    const focused = this._optionsList?.querySelector(".option:focus");
    if (focused) {
      focused.removeAttribute("tabindex");
      focused.blur();
    }

    if (!this.asyncUrl || !this._searchQuery) {
      this._searchQuery = "";
      if (this._searchInput) this._searchInput.value = "";
    }

    // Clear activedescendant
    if (this._elements.trigger) {
      this._elements.trigger.removeAttribute("aria-activedescendant");
    }

    this._renderOptions();
    this.dispatchEvent(new CustomEvent(FabSelect.EVENT_TYPES.CLOSE));
  }

  /**
   * Toggles dropdown open/closed state
   * @public
   */
  toggle() {
    this._isOpen ? this.close() : this.open();
  }

  /**
   * Focuses the trigger button
   * @public
   */
  focus() {
    this._trigger.focus();
  }

  /**
   * Blurs the trigger button
   * @public
   */
  blur() {
    this._trigger.blur();
  }

  // =====================
  // PRIVATE — INITIALIZATION
  // =====================

  /**
   * Caches frequently accessed DOM elements for performance
   * @private
   */
  _cacheElements() {
    if (!this._shadow) return;

    this._elements = {
      wrapper: this._shadow.querySelector(".wrapper"),
      trigger: this._shadow.querySelector(".trigger"),
      dropdown: this._shadow.querySelector(".dropdown"),
      searchInput: this._shadow.querySelector(".search-input"),
      optionsList: this._shadow.querySelector(".options-list"),
      refreshBtn: this._shadow.querySelector(".refresh-btn"),
      helperText: this._shadow.querySelector(".helper-text"),
      selectedDisplay: this._shadow.querySelector(".selected-display"),
      chevron: this._shadow.querySelector(".chevron"),
      announcer: this._shadow.querySelector('[aria-live="polite"]'),
    };
  }

  /**
   * Initializes options from DOM children and data attributes
   * @private
   */
  _loadInitialOptions() {
    this._options = [];
    this._groups = [];

    const nativeOptions = this.querySelectorAll(":scope > option, :scope > optgroup > option");
    nativeOptions.forEach((opt) => {
      const group = opt.parentElement.tagName === "OPTGROUP" ? opt.parentElement.label : null;
      this._options.push({
        value: String(opt.value),
        label: opt.textContent.trim(),
        disabled: opt.disabled,
        group: group || null,
        id: `fab-option-${Math.random().toString(36).substr(2, 9)}`,
      });
      if (group && !this._groups.includes(group)) {
        this._groups.push(group);
      }
    });

    const dataOptions = this.getAttribute("options");
    if (dataOptions) {
      try {
        const parsed = JSON.parse(dataOptions);
        this._options = [
          ...this._options,
          ...parsed.map((opt, idx) => ({
            value: String(opt.value),
            label: opt.label,
            disabled: opt.disabled || false,
            group: opt.group || null,
            id: `fab-option-${Date.now()}-${idx}`,
          })),
        ];
        this._groups = [
          ...new Set([...this._groups, ...parsed.filter((o) => o.group).map((o) => o.group)]),
        ];
      } catch (e) {
        console.warn("[FabSelect] Invalid options JSON:", e);
      }
    }

    this._updateDisplay();
    this._validate();
  }

  /**
   * Associates component with parent form for submission support
   * @private
   */
  _checkFormAssociation() {
    this._formElement = this.closest("form");
    if (this._formElement) {
      this._formElement.addEventListener("submit", this._handleFormSubmit.bind(this));
      this._formElement.addEventListener("reset", this._handleFormReset.bind(this));
    }
  }

  // =====================
  // PRIVATE — ASYNC LOADING
  // =====================

  /**
   * Fetches options from async URL with debouncing and cancellation support
   * @param {Object} params - Query parameters
   * @param {boolean} append - Whether to append or replace options
   * @returns {Promise<void>}
   * @private
   */
  async _fetchOptions(params = {}, append = false) {
    if (this._isLoading || this._isFetching) {
      console.debug("[FabSelect] Request skipped - already fetching");
      return;
    }

    this._isFetching = true;

    try {
      if (this._abortController) {
        this._abortController.abort();
      }
      this._abortController = new AbortController();

      this._isLoading = true;
      this._setError(null);
      this.setAttribute("aria-busy", "true");
      this._renderLoadingState();

      // Dispatch load start event
      this.dispatchEvent(new CustomEvent(FabSelect.EVENT_TYPES.LOADSTART, { bubbles: true }));

      const url = new URL(this.asyncUrl, window.location.origin);
      const queryParams = new URLSearchParams({
        ...this.asyncParams,
        ...params,
        q: this._searchQuery || "",
      });
      url.search = queryParams.toString();

      try {
        const response = await fetch(url.toString(), {
          signal: this._abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        let loadedOptions = [];

        if (Array.isArray(data.options)) {
          loadedOptions = data.options;
        } else if (Array.isArray(data.groups)) {
          loadedOptions = data.groups.flatMap((group) =>
            group.options.map((opt) => ({
              ...opt,
              group: group.name,
            })),
          );
          this._groups = data.groups.map((g) => g.name);
        } else if (Array.isArray(data)) {
          loadedOptions = data;
        } else {
          console.error("[FabSelect] Invalid response format:", data);
          throw new Error("Invalid API response format");
        }

        if (!append) {
          this._options = [];
          this._groups = [];
        }

        this.setOptions(
          loadedOptions.map((opt, idx) => ({
            value: String(opt.value),
            label: opt.label,
            disabled: opt.disabled || false,
            group: opt.group || null,
            id: `fab-option-${Date.now()}-${idx}`,
          })),
        );

        this._isLoading = false;
        this.removeAttribute("aria-busy");
        this._setError(null);
        this._updateDisplay();

        // Dispatch load completion event
        this.dispatchEvent(new CustomEvent(FabSelect.EVENT_TYPES.LOADEND, { bubbles: true }));
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("[FabSelect] Async load failed:", error);
        this._setError(error.message);
        this._isLoading = false;
        this.removeAttribute("aria-busy");

        // Dispatch error event
        this.dispatchEvent(
          new CustomEvent(FabSelect.EVENT_TYPES.ERROR, {
            bubbles: true,
            detail: { error: error.message },
          }),
        );
      }
    } finally {
      this._isFetching = false;
    }
  }

  // =====================
  // PRIVATE — RENDERING
  // =====================

  /**
   * Renders the component's shadow DOM
   * @private
   */
  _render() {
    this._shadow.innerHTML = `
      <style>
        :host {
          --fab-bg: transparent;
          --fab-bg-disabled: transparent;
          --fab-surface: light-dark(oklch(1 0 0 / 1), oklch(0.29 0 286.18 / 1));
          --fab-border: light-dark(oklch(0.86 0 286.31 / 1), #808178);
          --fab-border-hover: #aeafa6;
          --fab-text: light-dark(oklch(0.23 0 286.09 / 1), oklch(0.97 0 286.35 / 1));
          --fab-text-muted: light-dark(oklch(0.65 0.03 285.64 / 1), oklch(0.65 0.03 285.64 / 1));
          --fab-placeholder: light-dark(oklch(0.65 0.03 285.64 / 1), oklch(0.65 0.03 285.64 / 1));
          --fab-accent: oklch(0.92 0.20 116.39 / 1);
          --fab-accent-weak: oklch(0.92 0.20 116.39 / .5);
          --fab-accent-ring: oklch(0.92 0.20 116.39 / .05);
          --fab-error: oklch(0.66 0.22 25.73 / 1);
          --fab-error-ring: oklch(0.66 0.22 25.73 / 0.15);
          --fab-chip-bg: light-dark(oklch(0.91 0 286.32 / 1), oklch(0.35 0 286.22 / 1));
          --fab-chip-hover: light-dark(oklch(0.86 0 286.31 / 1), oklch(0.41 0 286.25 / 1));
          --fab-divider: light-dark(oklch(0.91 0 286.32 / 1), oklch(0.35 0 286.22 / 1));
          --fab-hover-bg: light-dark(oklch(0.96 0 286.35 / 1), oklch(0.35 0 286.22 / 1));
          --fab-shadow: 0 4px 16px oklch(0 0 0 / 0.12);

          --fab-font-family: inherit;
          --fab-font-size: inherit;
          --fab-font-size-sm: 0.875rem;
          --fab-font-size-xs: 0.75rem;

          --fab-width: 400px;
          --fab-min-height: clamp(1.875rem, 1.6193rem + 1.1364vw, 2.5rem);
          --fab-padding-y: clamp(0.1875rem, 0.1619rem + 0.1136vw, 0.25rem);
          --fab-padding-x: clamp(0.5625rem, 0.4858rem + 0.3409vw, 0.75rem);
          --fab-gap: 0.5rem;
          --fab-chevron-size: 20px;
          --fab-icon-size: 18px;
          --fab-chip-padding-x: 0.5rem;
          --fab-chip-padding-y: 0.25rem;
          --fab-chip-gap: 0.25rem;
          --fab-chip-radius: 4px;
          --fab-chip-max-width: 100%;

          --fab-radius: clamp(0.375rem, 0.3239rem + 0.2273vw, 0.5rem);
          --fab-radius-sm: 6px;
          --fab-radius-pill: 50%;

          --fab-dropdown-max-height: 400px;
          --fab-options-max-height: 280px;
          --fab-transition: 0.15s;
          --fab-dropdown-transition: 0.2s ease-out;

          display: inline-block;
          width: 100%;
          font-family: var(--fab-font-family);
          font-size: var(--fab-font-size);
        }

        .wrapper { position: relative; width: 100%; }
        .wrapper:has(.dropdown.open) .trigger { border-color: var(--fab-accent-weak); }
        .trigger {
          display: flex; align-items: center; justify-content: space-between;
          width: min(100%, var(--fab-width, 400px));
          min-height: var(--fab-min-height);
          padding: var(--fab-padding-y) var(--fab-padding-x) var(--fab-padding-y) var(--fab-padding-x);
          background: var(--fab-bg); border: 1px solid var(--fab-border);
          border-radius: var(--fab-radius); cursor: pointer;
          transition: border-color var(--fab-transition), box-shadow var(--fab-transition);
          color: var(--fab-text); font-family: inherit; font-size: inherit;
        }
        :host([disabled]) .trigger { background: var(--fab-bg-disabled); opacity: 0.6; cursor: not-allowed; }
        :host(:not([disabled])) .trigger:hover { border-color: var(--fab-border-hover); }
        :host(:not([disabled])) .trigger:focus-within {
          border-color: var(--fab-accent); box-shadow: 0 0 0 3px var(--fab-accent-ring); outline: none;
        }
        :host([invalid]) .trigger { border-color: var(--fab-error); }
        :host([invalid]) .trigger:focus-within { box-shadow: 0 0 0 3px var(--fab-error-ring); }
        .selected-display {
          display: flex; flex-wrap: wrap; gap: var(--fab-gap);
          align-items: center; flex: 1; min-width: 0;
        }
        .placeholder-text { color: var(--fab-placeholder); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .single-value { color: var(--fab-text); }
        .chip {
          display: inline-flex; align-items: center; gap: var(--fab-chip-gap);
          padding: var(--fab-chip-padding-y) var(--fab-chip-padding-x);
          background: var(--fab-chip-bg); border-radius: var(--fab-chip-radius);
          font-size: var(--fab-font-size-sm); color: var(--fab-text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: var(--fab-chip-max-width);
        }
        .chip-remove {
          width: 14px; height: 14px; border: none; background: transparent;
          color: var(--fab-text-muted); cursor: pointer; display: flex;
          align-items: center; justify-content: center;
          border-radius: var(--fab-radius-pill); transition: background var(--fab-transition);
          flex-shrink: 0;
        }
        .chip-remove:hover { background: var(--fab-chip-hover); color: var(--fab-text); }
        .chevron {
          width: var(--fab-chevron-size); height: var(--fab-chevron-size);
          flex-shrink: 0; color: var(--fab-text-muted); transition: transform var(--fab-transition);
        }
        :host([aria-expanded="true"]) .chevron { transform: rotate(180deg); }
        .loading-spinner {
          width: var(--fab-chevron-size); height: var(--fab-chevron-size);
          border: 2px solid var(--fab-divider); border-top-color: var(--fab-accent);
          border-radius: var(--fab-radius-pill); animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: var(--fab-surface); border: 1px solid var(--fab-border);
          border-radius: var(--fab-radius); box-shadow: var(--fab-shadow);
          z-index: 1000; max-height: 0; overflow: hidden;
          transition: max-height var(--fab-dropdown-transition), opacity var(--fab-dropdown-transition);
          opacity: 0;
        }
        .dropdown.open { max-height: var(--fab-dropdown-max-height); opacity: 1; }
        .search-container {
          padding: var(--fab-padding-y); border-bottom: 1px solid var(--fab-divider);
          position: sticky; top: 0; background: var(--fab-surface);
          z-index: 1; display: flex; align-items: center; gap: var(--fab-gap);
        }
        .search-input {
          flex: 1; padding: 0.5rem 0.75rem; border: 1px solid var(--fab-border);
          border-radius: var(--fab-radius-sm); font-size: var(--fab-font-size-sm);
          outline: none; background: var(--fab-surface); color: var(--fab-text);
          transition: border-color var(--fab-transition), box-shadow var(--fab-transition);
        }
        .search-input::placeholder { color: var(--fab-placeholder); }
        .search-input:focus {
          border-color: var(--fab-accent); box-shadow: 0 0 0 3px var(--fab-accent-ring);
        }
        .refresh-btn {
          width: 28px; height: 28px; border: none; background: transparent;
          color: var(--fab-text-muted); cursor: pointer; border-radius: var(--fab-radius-sm);
          display: flex; align-items: center; justify-content: center;
          transition: background var(--fab-transition), color var(--fab-transition);
          flex-shrink: 0;
        }
        .refresh-btn:hover { background: var(--fab-hover-bg); color: var(--fab-accent); }
        .error-message {
          color: var(--fab-error); font-size: var(--fab-font-size-xs);
          padding: 0.5rem 1rem; border-bottom: 1px solid var(--fab-divider);
        }
        .options-list {
          max-height: var(--fab-options-max-height); overflow-y: auto;
          list-style: none; margin: 0; padding: 0;
        }
        .option-group { padding: 0.5rem 1rem 0; }
        .group-header {
          font-weight: 600; font-size: var(--fab-font-size-xs);
          color: var(--fab-text-muted); text-transform: uppercase;
          letter-spacing: 0.5px; padding: 0.5rem 0; border-top: 1px solid var(--fab-divider);
        }
        .option-group:first-child .group-header { border-top: none; }
        .option {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.6rem 1rem; cursor: pointer;
          transition: background var(--fab-transition); color: var(--fab-text);
        }
        .option:hover:not(.disabled) { background: var(--fab-hover-bg); }
        .option:focus-visible {
          outline: 2px solid var(--fab-accent);
          outline-offset: -2px;
          background: var(--fab-hover-bg);
        }
        .option.selected { background: var(--fab-accent-weak); }
        .option.disabled { opacity: 0.5; cursor: not-allowed; }
        .option-checkbox {
          width: var(--fab-icon-size); height: var(--fab-icon-size);
          border: 2px solid var(--fab-border); border-radius: var(--fab-chip-radius);
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          transition: background var(--fab-transition), border-color var(--fab-transition);
        }
        .option.selected .option-checkbox { background: var(--fab-accent); border-color: var(--fab-accent); }
        .option-checkbox::after {
          content: ''; width: 10px; height: 10px; background: transparent;
          clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
          opacity: 0; transition: opacity var(--fab-transition);
        }
        .option.selected .option-checkbox::after { background: contrast-color(var(--fab-accent)); opacity: 1; }
        .option-label {
          flex: 1; white-space: nowrap; overflow: hidden;
          text-overflow: ellipsis; color: var(--fab-text);
        }
        .empty-state, .loading-state {
          padding: 2rem 1rem; text-align: center;
          color: var(--fab-text-muted); font-size: var(--fab-font-size-sm);
        }
        .loading-state .spinner {
          width: 24px; height: 24px; border: 2px solid var(--fab-divider);
          border-top-color: var(--fab-accent); border-radius: var(--fab-radius-pill);
          animation: spin 0.8s linear infinite; margin: 0 auto 1rem;
        }
        .error-state {
          padding: 1.5rem; text-align: center; color: var(--fab-error);
          font-size: var(--fab-font-size-sm);
        }
        .retry-btn {
          margin-top: 1rem; padding: 0.5rem 1rem; background: var(--fab-accent);
          color: #fff; border: none; border-radius: var(--fab-radius-sm);
          cursor: pointer; font-size: var(--fab-font-size-sm);
        }
        .retry-btn:hover { opacity: 0.9; }
        .helper-text {
          margin-top: 0.5rem; font-size: var(--fab-font-size-xs);
          color: var(--fab-error); padding: 0 0.25rem;
        }
      </style>

      <div class="wrapper">
        <button
          type="button"
          class="trigger"
          part="trigger"
          aria-haspopup="listbox"
          aria-expanded="${this._isOpen}"
          aria-invalid="${this.required && this._selectedValues.length === 0}"
          tabindex="${this.disabled ? -1 : 0}"
          ${this.disabled ? "disabled" : ""}
        >
          <span class="selected-display" part="selected-display"></span>
          ${
            this._isLoading
              ? '<div class="loading-spinner" part="spinner"></div>'
              : `<svg class="chevron" part="chevron" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
            </svg>`
          }
        </button>

        <div class="dropdown" part="dropdown" role="listbox">
          <div class="search-container" part="search-container">
            <input
              type="text"
              class="search-input"
              part="search-input"
              placeholder="Search..."
              aria-label="Search options"
              autocomplete="off"
              ${this.disabled ? "disabled" : ""}
            />
            ${
              this.asyncUrl
                ? `<button type="button" class="refresh-btn" part="refresh-btn" aria-label="Refresh options" title="Refresh">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.034 2.842A7.947 7.947 0 004.167 4.68l-.89-1.234a9.33 9.33 0 018.094-2.043V.667h1v2.175H11.034zM2.5 8a5.5 5.5 0 016.656-5.355l.127-.989A6.496 6.496 0 002.5 8zm6.368-1.722l.89 1.234a7.947 7.947 0 01-6.867-1.838v2.175h-1V8.333h2.175l2.802 3.882.81-1.175L8.868 6.278z"/>
                </svg>
              </button>`
                : ""
            }
          </div>

          ${
            this._error
              ? `<div class="error-message" part="error-message">${this._escapeHtml(this._error)}</div>`
              : ""
          }

          <ul class="options-list" part="options-list" role="presentation"></ul>
        </div>
      </div>

      ${this.required ? '<div class="helper-text" part="helper-text" aria-live="polite"></div>' : ""}
      <div class="visually-hidden" part="announcer" aria-live="polite" aria-atomic="true" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;"></div>
    `;

    // Wire up refresh button event listener
    const refreshBtn = this._shadow.querySelector(".refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.refreshAsync());
    }

    this._updateDisplay();
  }

  /**
   * Renders the options list with caching and grouping
   * @private
   */
  _renderOptions() {
    this._cacheElements();
    const list = this._elements?.optionsList || this._shadow?.querySelector(".options-list");
    if (!list) return;

    if (this._isLoading) {
      list.innerHTML = `
        <li class="loading-state" part="loading-state">
          <div class="spinner"></div>
          Loading...
        </li>
      `;
      return;
    }

    if (this._error && this._options.length === 0) {
      list.innerHTML = `
        <li class="error-state" part="error-state">
          Failed to load options
          <button class="retry-btn" part="retry-btn">Try Again</button>
        </li>
      `;
      const retryBtn = list.querySelector(".retry-btn");
      if (retryBtn) retryBtn.addEventListener("click", () => this.refreshAsync());
      return;
    }

    if (this._options.length === 0) {
      list.innerHTML = '<li class="empty-state" part="empty-state">No options found</li>';
      return;
    }

    // Cache filtered results to avoid redundant filtering
    if (!this._filteredOptionsCache || this._filteredOptionsCache.query !== this._searchQuery) {
      this._filteredOptionsCache = {
        query: this._searchQuery,
        data: this._options.filter(
          (opt) =>
            !this._searchQuery || opt.label.toLowerCase().includes(this._searchQuery.toLowerCase()),
        ),
      };
    }
    const filtered = this._filteredOptionsCache.data;

    if (filtered.length === 0) {
      list.innerHTML =
        '<li class="empty-state" part="empty-state">No options match your search</li>';
      return;
    }

    // Reuse grouping logic
    list.innerHTML = this._buildGroupedListHTML(filtered);
  }

  /**
   * Builds grouped options HTML
   * @param {{value:string, label:string}[]} options - Filtered options
   * @returns {string} HTML string
   * @private
   */
  _buildGroupedListHTML(options) {
    const grouped = {};
    options.forEach((opt) => {
      const groupName = opt.group || "__ungrouped__";
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(opt);
    });

    const sortedGroups = Object.keys(grouped).sort((a, b) => {
      if (a === "__ungrouped__") return 1;
      if (b === "__ungrouped__") return -1;
      return a.localeCompare(b);
    });

    return sortedGroups
      .map((groupName) => this._buildGroupHTML(groupName, grouped[groupName]))
      .join("");
  }

  /**
   * Builds HTML for a single group
   * @param {string} groupName - Group name
   * @param {{value:string, label:string}[]} options - Options in group
   * @returns {string} HTML string
   * @private
   */
  _buildGroupHTML(groupName, options) {
    const header =
      groupName === "__ungrouped__"
        ? null
        : `<div class="group-header" part="group-header">${this._escapeHtml(groupName)}</div>`;

    const optionsHTML = options.map((opt) => this._buildOptionHTML(opt)).join("");

    return `
      <li class="option-group" part="option-group">
        ${header || ""}
        ${optionsHTML}
      </li>
    `;
  }

  /**
   * Builds HTML for a single option
   * @param {{value:string, label:string, disabled:boolean, id:string}} opt - Option data
   * @returns {string} HTML string
   * @private
   */
  _buildOptionHTML(opt) {
    const isSelected = this._isSelected(opt.value);
    const classes = ["option", isSelected ? "selected" : "", opt.disabled ? "disabled" : ""]
      .filter(Boolean)
      .join(" ");

    const partAttrs = [
      "option",
      isSelected ? "option-selected" : "",
      opt.disabled ? "option-disabled" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <li
        class="${classes}"
        part="${partAttrs}"
        role="option"
        data-value="${this._escapeAttr(opt.value)}"
        id="${opt.id}"
        aria-selected="${isSelected}"
        ${opt.disabled ? 'tabindex="-1"' : ""}
      >
        <div class="option-checkbox" part="option-checkbox"></div>
        <span class="option-label" part="option-label">${this._escapeHtml(opt.label)}</span>
      </li>
    `;
  }

  /**
   * Renders loading state
   * @private
   */
  _renderLoadingState() {
    const list = this._elements.optionsList;
    if (!list) return;
    list.innerHTML = `
      <li class="loading-state" part="loading-state">
        <div class="spinner"></div>
        Loading...
      </li>
    `;
  }

  /**
   * Renders error state with retry button
   * @param {string} message - Error message
   * @private
   */
  _renderErrorState(message) {
    const list = this._elements.optionsList;
    if (!list) return;
    list.innerHTML = `
      <li class="error-state" part="error-state">
        ${message}
        <button class="retry-btn" part="retry-btn">Try Again</button>
      </li>
    `;

    const retryBtn = list.querySelector(".retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => this.refreshAsync());
    }
  }

  // =====================
  // PRIVATE — EVENT SETUP
  // =====================

  /**
   * Sets up all event listeners with bound references
   * @private
   */
  _setupEventListeners() {
    if (!this._elements.trigger || !this._elements.searchInput) {
      console.error("[FabSelect] Critical elements missing from shadow DOM");
      return;
    }

    this._trigger = this._elements.trigger;
    this._dropdown = this._elements.dropdown;
    this._searchInput = this._elements.searchInput;
    this._optionsList = this._elements.optionsList;
    this._refreshBtn = this._elements.refreshBtn;
    this._helperText = this._elements.helperText;

    if (!this._trigger || !this._searchInput) {
      console.error("[FabSelect] Critical elements missing from shadow DOM");
      return;
    }

    // Store bound handler references (prevents memory leaks)
    this._handleClickOutsideBound = this._handleClickOutside.bind(this);
    this._handleScrollOutsideBound = this._handleScrollOutside.bind(this);
    this._handleTriggerKeydownBound = this._handleTriggerKeydown.bind(this);
    this._handleOptionsKeydownBound = this._handleOptionsKeydown.bind(this);
    this._handleSearchKeydownBound = this._handleSearchKeydown.bind(this);

    this._trigger.addEventListener("click", () => {
      if (!this.disabled && this._searchInput) {
        this.toggle();
        if (this.loadOnOpen && this.asyncUrl && this._options.length === 0) {
          this.loadAsync();
        }
        this._searchInput.focus();
      }
    });

    this._searchInput.addEventListener("input", (e) => {
      if (!e || !e.target) return;

      clearTimeout(this._debounceTimer);

      const query = typeof e.target.value === "string" ? e.target.value.trim() : "";

      this._debounceTimer = setTimeout(async () => {
        this._searchQuery = query;

        // Abort previous request if pending
        if (this.asyncUrl) {
          await this.loadAsync({ search: query }, true);
        } else {
          this._renderOptions();
        }
      }, this.searchDebounce);
    });

    this._searchInput.addEventListener("keydown", (e) => {
      // Only handle navigation keys when dropdown is open
      if (this._isOpen) {
        this._handleSearchKeydownBound(e);
      } else if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        // Opening navigation from closed state
        e.preventDefault();
        this.open();
        setTimeout(() => this._focusFirstOption(), 0);
      }
    });

    if (this._refreshBtn) {
      this._refreshBtn.addEventListener("click", () => this.refreshAsync());
    }

    this._optionsList.addEventListener("click", (e) => {
      const option = e.target.closest(".option");
      if (!option || option.classList.contains("disabled")) return;

      const value = option.dataset.value;
      this._toggleSelection(value);

      if (this.mode === "single") {
        this.close();
      } else if (this._searchInput) {
        this._searchInput.focus();
      }
    });

    // KEYBOARD NAV ON TRIGGER
    this._trigger.addEventListener("keydown", this._handleTriggerKeydownBound);

    // KEYBOARD NAV WHEN DROPDOWN IS OPEN
    this._optionsList.addEventListener("keydown", this._handleOptionsKeydownBound);

    document.addEventListener("click", this._handleClickOutsideBound);
    window.addEventListener("scroll", this._handleScrollOutsideBound, true);
  }

  /**
   * Handles keyboard events on trigger element
   * @param {KeyboardEvent} e - Keyboard event
   * @private
   */
  _handleTriggerKeydown(e) {
    switch (e.key) {
      case "ArrowDown":
      case "Enter":
        e.preventDefault();
        if (!this._isOpen) {
          this.open();
          this._focusFirstOption();
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!this._isOpen) {
          this.open();
          this._focusFirstOption();
        }
        break;
      case "Escape":
        if (this._isOpen) {
          e.preventDefault();
          this.close();
        }
        break;
      case "Tab":
        if (this._isOpen) {
          this.close();
        }
        break;
      case "Home":
      case "End":
        if (this._isOpen) {
          e.preventDefault();
          this._navigateToOption(e.key === "Home" ? 0 : -1);
        }
        break;
    }
  }

  /**
   * Handles keyboard events on options list
   * @param {KeyboardEvent} e - Keyboard event
   * @private
   */
  _handleOptionsKeydown(e) {
    if (!this._isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this._navigateNextOption();
        break;
      case "ArrowUp":
        e.preventDefault();
        this._navigatePrevOption();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        this._selectFocusedOption();
        break;
      case "Escape":
        e.preventDefault();
        this.close();
        this._trigger.focus();
        break;
      case "Tab":
        this.close();
        break;
      case "Home":
        e.preventDefault();
        this._navigateToOption(0);
        break;
      case "End":
        e.preventDefault();
        this._navigateToOption(-1);
        break;
    }
  }

  /**
   * Handles keyboard events on search input
   * @param {KeyboardEvent} e - Keyboard event
   * @private
   */
  _handleSearchKeydown(e) {
    if (!this._isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        this._focusFirstOption();
        break;
      case "ArrowUp":
        e.preventDefault();
        this._focusLastOption();
        break;
      case "Enter":
        e.preventDefault();
        // If there's a focused option, select it; otherwise select first matching option
        const focused = this._optionsList.querySelector(".option:focus");
        if (focused && !focused.classList.contains("disabled")) {
          this._selectFocusedOption();
        } else {
          const first = this._optionsList.querySelector(".option:not(.disabled)");
          if (first) {
            const value = first.dataset.value;
            this._toggleSelection(value);
            if (this.mode === "single") {
              this.close();
            }
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        this.close();
        this._trigger.focus();
        break;
      case "Tab":
        // Allow tab to close and move focus
        if (this._isOpen) {
          this.close();
        }
        break;
    }
  }

  /**
   * Focuses first non-disabled option
   * @private
   */
  _focusFirstOption() {
    const options = Array.from(this._optionsList.querySelectorAll(".option:not(.disabled)"));
    if (options.length > 0) {
      options[0].setAttribute("tabindex", "0");
      options[0].focus();

      // Update aria-activedescendant on trigger
      if (this._elements.trigger) {
        this._elements.trigger.setAttribute("aria-activedescendant", options[0].id);
      }
    }
  }

  /**
   * Focuses last non-disabled option
   * @private
   */
  _focusLastOption() {
    const options = Array.from(this._optionsList.querySelectorAll(".option:not(.disabled)"));
    if (options.length > 0) {
      const last = options[options.length - 1];
      last.setAttribute("tabindex", "0");
      last.focus();

      // Update aria-activedescendant on trigger
      if (this._elements.trigger) {
        this._elements.trigger.setAttribute("aria-activedescendant", last.id);
      }
    }
  }

  /**
   * Navigates to next option
   * @private
   */
  _navigateNextOption() {
    const options = Array.from(this._optionsList.querySelectorAll(".option:not(.disabled)"));
    const current = this._optionsList.querySelector(".option:focus");
    const currentIndex = options.indexOf(current);

    if (currentIndex < options.length - 1) {
      if (current) current.removeAttribute("tabindex");
      options[currentIndex + 1].setAttribute("tabindex", "0");
      options[currentIndex + 1].focus();

      // Update aria-activedescendant
      if (this._elements.trigger) {
        this._elements.trigger.setAttribute("aria-activedescendant", options[currentIndex + 1].id);
      }
    }
  }

  /**
   * Navigates to previous option
   * @private
   */
  _navigatePrevOption() {
    const options = Array.from(this._optionsList.querySelectorAll(".option:not(.disabled)"));
    const current = this._optionsList.querySelector(".option:focus");
    const currentIndex = options.indexOf(current);

    if (currentIndex > 0) {
      if (current) current.removeAttribute("tabindex");
      options[currentIndex - 1].setAttribute("tabindex", "0");
      options[currentIndex - 1].focus();

      // Update aria-activedescendant
      if (this._elements.trigger) {
        this._elements.trigger.setAttribute("aria-activedescendant", options[currentIndex - 1].id);
      }
    }
  }

  /**
   * Navigates to specific option index
   * @param {number} index - Index to navigate to (-1 for last)
   * @private
   */
  _navigateToOption(index) {
    const options = Array.from(this._optionsList.querySelectorAll(".option:not(.disabled)"));
    if (options.length === 0) return;

    if (index === -1) {
      index = options.length - 1;
    }

    if (index >= 0 && index < options.length) {
      const current = this._optionsList.querySelector(".option:focus");
      if (current) current.removeAttribute("tabindex");
      options[index].setAttribute("tabindex", "0");
      options[index].focus();

      // Update aria-activedescendant
      if (this._elements.trigger) {
        this._elements.trigger.setAttribute("aria-activedescendant", options[index].id);
      }
    }
  }

  /**
   * Selects currently focused option
   * @private
   */
  _selectFocusedOption() {
    const focused = this._optionsList.querySelector(".option:focus");
    if (focused && !focused.classList.contains("disabled")) {
      const value = focused.dataset.value;
      this._toggleSelection(value);

      if (this.mode === "single") {
        this.close();
      }
    }
  }

  /**
   * Cleans up all event listeners and timers
   * @private
   */
  _cleanup() {
    // Remove all event listeners using bound references
    document.removeEventListener("click", this._handleClickOutsideBound);
    window.removeEventListener("scroll", this._handleScrollOutsideBound, true);
    if (this._trigger) {
      this._trigger.removeEventListener("keydown", this._handleTriggerKeydownBound);
    }
    if (this._optionsList) {
      this._optionsList.removeEventListener("keydown", this._handleOptionsKeydownBound);
    }
    if (this._searchInput) {
      this._searchInput.removeEventListener("keydown", this._handleSearchKeydownBound);
    }

    // Clean up debounce timer
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    // Clean up fetch controller
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  /**
   * Handles clicks outside the component
   * @param {MouseEvent} e - Click event
   * @private
   */
  _handleClickOutside(e) {
    if (!this.contains(e.target) && this._isOpen) {
      this.close();
    }
  }

  /**
   * Handles scroll events outside the component
   * @param {UIEvent} e - Scroll event
   * @private
   */
  _handleScrollOutside(e) {
    if (!this.contains(e.target) && this._isOpen) {
      this.close();
    }
  }

  // =====================
  // PRIVATE — SELECTION LOGIC
  // =====================

  /**
   * Toggles selection for a value
   * @param {string} value - Value to toggle
   * @private
   */
  _toggleSelection(value) {
    const index = this._selectedValues.indexOf(String(value));
    const opt = this._options.find((o) => o.value === String(value));
    const label = opt?.label || value;

    if (this.mode === "single") {
      this._selectedValues = index >= 0 ? [] : [String(value)];
      this._announce(index >= 0 ? `Deselected ${label}` : `Selected ${label}`);
    } else {
      if (index >= 0) {
        this._selectedValues.splice(index, 1);
        this._announce(`Deselected ${label}. ${this._selectedValues.length} items selected`);
      } else {
        this._selectedValues.push(String(value));
        this._announce(`Selected ${label}. ${this._selectedValues.length} items selected`);
      }
    }

    this._updateDisplay();
    this._renderOptions();
    this._dispatchChangeEvent();
    this._notifyFormChange();
  }

  /**
   * Checks if a value is currently selected
   * @param {string} value - Value to check
   * @returns {boolean}
   * @private
   */
  _isSelected(value) {
    return this._selectedValues.includes(String(value));
  }

  /**
   * Updates the displayed selection values
   * @private
   */
  _updateDisplay() {
    const display = this._elements.selectedDisplay;
    if (!display) return;

    if (!this._selectedValues.length) {
      display.innerHTML = `<span class="placeholder-text" part="placeholder">${this.placeholder}</span>`;
      this._helperText?.setAttribute("hidden", "");
    } else if (this.mode === "single") {
      const selected = this._options.find((opt) => opt.value === this._selectedValues[0]);
      display.innerHTML = `<span class="single-value" part="single-value">${selected ? this._escapeHtml(selected.label) : this._selectedValues[0]}</span>`;
      this._helperText?.setAttribute("hidden", "");
    } else {
      display.innerHTML = this._selectedValues
        .map((value) => {
          const opt = this._options.find((o) => o.value === value);
          return `<span class="chip" part="chip">
            ${opt ? this._escapeHtml(opt.label) : value}
            <button class="chip-remove" part="chip-remove" data-remove="${value}" aria-label="Remove ${opt?.label || value}">&times;</button>
          </span>`;
        })
        .join("");

      display.querySelectorAll(".chip-remove").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this._toggleSelection(btn.dataset.remove);
        });
      });
      this._helperText?.setAttribute("hidden", "");
    }

    const focused = this._optionsList?.querySelector(".option:focus");
    if (focused) {
      focused.removeAttribute("tabindex");
    }
  }

  /**
   * Announces changes to screen readers
   * @param {string} message - Message to announce
   * @private
   */
  _announce(message) {
    const announcer = this._elements.announcer;
    if (announcer) {
      announcer.textContent = message;
    }
  }

  /**
   * Sets error state
   * @param {string|null} message - Error message or null to clear
   * @private
   */
  _setError(message) {
    this._error = message;
    this._renderOptions();
    const trigger = this._elements.trigger;
    if (trigger) {
      trigger.setAttribute("aria-invalid", message !== null ? "true" : "false");
    }
  }

  // =====================
  // PRIVATE — EVENTS & VALIDATION
  // =====================

  /**
   * Dispatches change event
   * @private
   */
  _dispatchChangeEvent() {
    this.dispatchEvent(
      new CustomEvent(FabSelect.EVENT_TYPES.CHANGE, {
        bubbles: true,
        composed: true,
        detail: { value: this.getValue() },
      }),
    );
  }

  /**
   * Notifies form of change
   * @private
   */
  _notifyFormChange() {
    if (this._formElement) {
      this._syncHiddenInput();
      this.dispatchEvent(
        new Event(FabSelect.EVENT_TYPES.INPUT, { bubbles: true, cancelable: true }),
      );
      this.dispatchEvent(
        new Event(FabSelect.EVENT_TYPES.CHANGE, { bubbles: true, cancelable: true }),
      );
    }
  }

  /**
   * Syncs hidden input for form submission
   * @private
   */
  _syncHiddenInput() {
    if (!this._formElement) return;

    const name = this.getAttribute("name");
    if (!name) return;

    let existingInput = this.querySelector(`[name="${name}"]`);
    if (!existingInput) {
      existingInput = document.createElement("input");
      existingInput.type = "hidden";
      existingInput.setAttribute("data-fab-select-sync", "true");
      this.appendChild(existingInput);
    }

    existingInput.name = name;

    if (this.mode === "single") {
      existingInput.value = this._selectedValues[0] || "";
      const siblings = this.querySelectorAll("[data-fab-select-sync-array]");
      siblings.forEach((sib) => sib.remove());
    } else {
      existingInput.value = this._selectedValues.join(",");
      const siblings = this.querySelectorAll("[data-fab-select-sync-array]");
      siblings.forEach((sib) => sib.remove());
      this._selectedValues.forEach((val) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = `${name}[]`;
        input.value = val;
        input.setAttribute("data-fab-select-sync-array", "true");
        this.appendChild(input);
      });
    }
  }

  /**
   * Handles form submit
   * @param {Event} e - Submit event
   * @private
   */
  _handleFormSubmit(e) {
    if (this._validate()) {
      this._syncHiddenInput();
    } else {
      e.preventDefault();
    }
  }

  /**
   * Handles form reset
   * @param {Event} e - Reset event
   * @private
   */
  _handleFormReset(e) {
    this.setValue([]);
    this._searchQuery = "";
    if (this._searchInput) this._searchInput.value = "";
    this._renderOptions();
  }

  /**
   * Validates the component
   * @param {boolean} checkOnly - If true, don't show validation UI
   * @returns {boolean}
   * @private
   */
  _validate(checkOnly = false) {
    const isValid = !this.required || this._selectedValues.length > 0;

    if (isValid && this._customError) {
      return false;
    }

    if (!checkOnly) {
      this.toggleAttribute("invalid", !isValid);
      if (this._helperText) {
        if (!isValid) {
          delete this._helperText.hidden;
          this._helperText.textContent = "This field is required";
        } else {
          this._helperText.setAttribute("hidden", "");
        }
      }
    }

    return isValid;
  }

  /**
   * Escapes HTML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   * @private
   */
  _escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Escapes attribute values (XSS protection)
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   * @private
   */
  _escapeAttr(str) {
    if (!str) return "";
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return String(str).replace(/[&<>"']/g, (c) => map[c]);
  }

  /**
   * Resets selection and search state
   * @private
   */
  _resetSelection() {
    this._selectedValues = [];
    this._searchQuery = "";
    this._updateDisplay();
    this._notifyFormChange();
  }
}

customElements.define("fab-select", FabSelect);
