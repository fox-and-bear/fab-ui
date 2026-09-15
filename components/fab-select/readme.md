# FabSelect

A fully customizable, searchable select/multi-select web component with support for grouping, async
loading, and form integration. Built with zero dependencies and styled via CSS custom properties and
Shadow Parts.

## Features

- Live search – Filter options as you type
- Single & Multi-select modes – Switch via mode attribute
- Group support – Via `<optgroup>` or JSON options
- Async loading – Fetch options from API endpoints
- Form integration – Automatic hidden input syncing
- Accessible – Full ARIA attributes and keyboard navigation
- Theming – Extensive CSS custom properties and ::part() styling
- Zero dependencies – Plain web components

## Quick Start

### 1. Install

Simply include the script in your HTML:

```html
<script src="fab-select.js"></script>
```

### 2. Basic Usage

```html
<!-- Single Select -->
<fab-select placeholder="Choose an option">
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
</fab-select>

<!-- Multi-Select -->
<fab-select mode="multi" placeholder="Select items">
  <option value="a">Item A</option>
  <option value="b">Item B</option>
</fab-select>
```

## API Reference

### Attributes

| Attribute         | Type                    | Description                                  |
| ----------------- | ----------------------- | -------------------------------------------- |
| `mode`            | `'single'` \| `'multi'` | Selection mode (default: `single`)           |
| `placeholder`     | `string`                | Placeholder text when nothing selected       |
| `name`            | `string`                | Form field name for submission               |
| `disabled`        | `boolean`               | Disables the component                       |
| `required`        | `boolean`               | Marks as required for validation             |
| `async-url`       | `URL`                   | API endpoint for loading options             |
| `async-params`    | `JSON`                  | Query params sent with async requests        |
| `search-debounce` | `number`                | Debounce delay for search (ms, default: 300) |
| `load-on-open`    | `boolean`               | Load data when dropdown opens                |
| `options`         | `JSON`                  | Inline options array                         |

### Public Methods

| Method                       | Returns    | Description                    |
| ---------------------------- | ---------- | ------------------------------ |
| `getValue()`                 | `value(s)` | Get current selection          |
| `setValue(value)`            | `void`     | Set selection programmatically |
| `getOptions()`               | `array`    | Get all options                |
| `setOptions(options)`        | `void`     | Replace all options            |
| `addOption(option)`          | `void`     | Add single option              |
| `removeOption(value)`        | `void`     | Remove option by value         |
| `loadAsync(params, append?)` | `promise`  | Load options from async-url    |
| `refreshAsync()`             | `promise`  | Reload options                 |
| `isLoading()`                | `boolean`  | Check loading state            |
| `getGroups()`                | `array`    | Get all group names            |
| `addGroup(name, options?)`   | `void`     | Add group                      |
| `removeGroup(name)`          | `void`     | Remove group                   |
| `open()`                     | `void`     | Open dropdown                  |
| `close()`                    | `void`     | Close dropdown                 |
| `toggle()`                   | `void`     | Toggle dropdown                |
| `focus()`                    | `void`     | Focus the trigger              |
| `blur()`                     | `void`     | Blur the trigger               |
| `reportValidity()`           | `boolean`  | Validate and show errors       |
| `checkValidity()`            | `boolean`  | Validate only                  |
| `setCustomValidity(message)` | `void`     | Set custom validation message  |

---

## Events

| Event    | Detail      | Description                      |
| -------- | ----------- | -------------------------------- |
| `change` | `{ value }` | Fired when selection changes     |
| `input`  | —           | Fires alongside change for forms |
| `open`   | —           | Fired when dropdown opens        |
| `close`  | —           | Fired when dropdown closes       |

```js
const select = document.querySelector("fab-select");

select.addEventListener("change", (e) => {
  console.log("Selected:", e.detail.value);
});

select.addEventListener("open", () => {
  console.log("Dropdown opened");
});
```

## Grouped Options

Via `<optgroup>`:

```html
<fab-select placeholder="Select framework">
  <optgroup label="JavaScript">
    <option value="react">React</option>
    <option value="vue">Vue</option>
  </optgroup>
  <optgroup label="CSS">
    <option value="tailwind">Tailwind</option>
    <option value="bootstrap">Bootstrap</option>
  </optgroup>
</fab-select>
```

Via JSON:

```html
<fab-select
  options='[
  {"value": "react", "label": "React", "group": "JS"},
  {"value": "vue", "label": "Vue", "group": "JS"},
  {"value": "tailwind", "label": "Tailwind", "group": "CSS"}
]'></fab-select>
```

## Async Loading

```html
<fab-select
  async-url="/api/countries"
  async-params='{"region": "europe"}'
  load-on-open
  placeholder="Search countries"></fab-select>
```

### Expected API Response Format:

Flat options:

```json
{
  "options": [
    { "value": "us", "label": "United States" },
    { "value": "uk", "label": "United Kingdom" }
  ]
}
```

With groups:

```json
{
  "groups": [
    {
      "name": "North America",
      "options": [
        { "value": "us", "label": "United States" },
        { "value": "ca", "label": "Canada" }
      ]
    }
  ]
}
```

## Form Integration

Automatically syncs with parent forms:

```html
<form id="myForm">
  <fab-select name="category" required>
    <option value="tech">Technology</option>
    <option value="business">Business</option>
  </fab-select>

  <button type="submit">Submit</button>
</form>
```

```js
<script>
document.getElementById('myForm').addEventListener('submit', e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  console.log(formData.get('category'));
});
</script>
```

### Multi-select submits as `name[]`:

```js
formData.getAll("interests[]"); // ['tech', 'design']
```

## Theming

### CSS Custom Properties

Override on `<fab-select>` or globally:

```css
fab-select {
  /* Colours */
  --fab-bg: #ffffff;
  --fab-bg-disabled: #f5f5f7;
  --fab-surface: #ffffff;
  --fab-border: #c8c8d0;
  --fab-border-hover: var(--fab-accent);
  --fab-text: #333333;
  --fab-text-muted: #8e8ea0;
  --fab-placeholder: #8e8ea0;
  --fab-accent: #6d4aff;
  --fab-accent-weak: rgba(109, 74, 255, 0.08);
  --fab-accent-ring: rgba(109, 74, 255, 0.15);
  --fab-error: #ff4444;
  --fab-error-ring: rgba(255, 68, 68, 0.15);
  --fab-chip-bg: #e8e8ea;
  --fab-chip-hover: #d0d0d3;
  --fab-divider: #f0f0f2;
  --fab-hover-bg: #f5f5f7;
  --fab-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);

  /* Typography */
  --fab-font-family: inherit;
  --fab-font-size: inherit;
  --fab-font-size-sm: 0.875rem;
  --fab-font-size-xs: 0.75rem;

  /* Sizing */
  --fab-min-height: 44px;
  --fab-padding-x: 1rem;
  --fab-padding-y: 0.75rem;
  --fab-gap: 0.5rem;
  --fab-chevron-size: 20px;
  --fab-icon-size: 18px;

  /* Geometry */
  --fab-radius: 8px;
  --fab-radius-sm: 6px;
  --fab-radius-pill: 50%;
}
```

### Shadow Parts (::part())

Target specific elements directly:

```css
fab-select::part(trigger) {
  border-width: 2px;
  border-radius: 4px;
}

fab-select::part(dropdown) {
  border-radius: 0 0 8px 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

fab-select::part(search-input) {
  border-bottom: 2px solid var(--fab-accent);
  border-radius: 0;
}

fab-select::part(chip) {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

fab-select::part(option) {
  padding-left: 2rem;
}

fab-select::part(option-selected) {
  font-weight: bold;
}

fab-select::part(group-header) {
  font-size: 0.7rem;
  color: var(--fab-accent);
}

fab-select::part(chevron) {
  color: var(--fab-accent);
}
```

### Dark Mode Example

```css
@media (prefers-color-scheme: dark) {
  fab-select {
    --fab-bg: #1a1a2e;
    --fab-surface: #16213e;
    --fab-text: #e0e0e0;
    --fab-text-muted: #8892b0;
    --fab-border: #233;
    --fab-accent: #64ffda;
    --fab-accent-weak: rgba(100, 255, 218, 0.1);
    --fab-chip-bg: #233;
    --fab-hover-bg: rgba(255, 255, 255, 0.05);
    --fab-divider: #233;
  }
}
```

## Accessibility

- Full keyboard navigation (↑↓, Enter, Escape, Tab)
- ARIA roles (listbox, option)
- ARIA attributes (aria-expanded, aria-selected, aria-invalid, aria-busy)
- Screen reader announcements
- Focus indicators
- Form association

## Keyboard controls:

| Key           | Action                |
| ------------- | --------------------- |
| `↑/↓`         | Navigate options      |
| `Enter/Space` | Select focused option |
| `Home`        | First Option          |
| `End`         | Last Option           |
| `Escape`      | Close dropdown        |
| `Tab`         | Close and move focus  |

## Browser Compatibility

| Browser | Version |
| ------- | ------- |
| Chrome  | 61+     |
| Firefox | 60+     |
| Safari  | 11+     |
| Edge    | 79+     |

Requires native Custom Elements and Shadow DOM support. For older browsers, include polyfills:

```html
<script src="https://unpkg.com/@webcomponents/webcomponentsjs@2/webcomponents-loader.js"></script>
```

## Programmatic Control Examples

### Setting Values

```js
const select = document.querySelector("fab-select");

// Single select
select.setValue("react");

// Multi select
select.setValue(["react", "vue"]);

// Get value
const value = select.getValue(); // 'react' or ['react', 'vue']
```

### Dynamic Options

```js
select.addOption({ value: "svelte", label: "Svelte", group: "JS" });
select.removeOption("angular");

// Add group
select.addGroup("Mobile", [
  { value: "flutter", label: "Flutter" },
  { value: "react-native", label: "React Native" },
]);

// Remove group
select.removeGroup("Legacy");
```

### Async Control

```js
// Load with params
await select.loadAsync({ region: "asia", limit: 50 });

// Refresh
await select.refreshAsync();

// Check loading state
if (select.isLoading()) {
  console.log("Still loading...");
}
```

### Validation

```js
// Check validity
const isValid = select.checkValidity();

// Report with UI
const valid = select.reportValidity();

// Custom error
select.setCustomValidity("Please choose at least one option");
```

License MIT License © 2024
