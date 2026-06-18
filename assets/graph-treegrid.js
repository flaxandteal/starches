'use strict';

// W3C APG Treegrid — generic, hierarchical, keyboard-accessible grid.
// https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/
//
// Adapted from relations-treegrid.js: the navigation/focus/expand engine is
// unchanged; only _render / _buildRows / _getStyles are generalised so the
// grid is driven by arbitrary `{ columns, rows }` data rather than the
// relations-specific shape. Used by graph-detail.ts to show a resource
// model's node tree and card tree.
//
// Data shape (set via the `data` property):
//   {
//     ariaLabel?: string,
//     columns: [{ label: string, width?: string }],
//     rows: TreeRow[]
//   }
//   TreeRow = {
//     cells: Cell[],            // one per column; first cell carries the expander
//     children?: TreeRow[],
//     expanded?: boolean        // initial state (default: expanded)
//   }
//   Cell = string | { text?, title?, className?, pill?: boolean, href? }
class GraphTreeGrid extends HTMLElement {

  // --- State ---

  _prevTreeGridFocus = null;
  _tabbingRow = null;
  _data = null;
  _connected = false;
  _doAllowRowFocus = true;
  _doStartRowFocus = true;

  // Bound event handlers
  _onKeyDown = (event) => this._handleKeyDown(event);
  _onClick = (event) => this._handleClick(event);
  _onDblClick = (event) => this._handleDblClick(event);
  _onFocusIn = (event) => this._handleFocusIn(event);

  // --- Lifecycle ---

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this._connected = true;
    if (this._data) this._render();
  }

  disconnectedCallback() {
    this._connected = false;
    this._removeEventListeners();
  }

  // --- Public API ---

  get data() { return this._data; }
  set data(value) {
    this._data = value;
    if (this._connected) this._render();
  }

  // --- Rendering ---

  _esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  _render() {
    if (!this._data) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    const columns = this._data.columns || [];
    const rows = this._data.rows || [];
    const label = this.getAttribute('aria-label') || this._data.ariaLabel || 'Tree Grid';

    const colgroup = columns
      .map((c) => `<col${c.width ? ` style="width:${this._esc(c.width)}"` : ''}>`)
      .join('');
    const head = columns
      .map((c) => `<th scope="col">${this._esc(c.label)}</th>`)
      .join('');

    let body = '';
    for (let i = 0; i < rows.length; i++) {
      body += this._buildRows(rows[i], 1, i + 1, rows.length, false);
    }

    this.shadowRoot.innerHTML = `
      <style>${this._getStyles()}</style>
      <table role="treegrid" aria-label="${this._esc(label)}">
        <colgroup>${colgroup}</colgroup>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    `;

    this._initAttributes();
    this._addEventListeners();
  }

  _buildRows(row, level, posInSet, setSize, hidden) {
    const children = row.children || [];
    const hasChildren = children.length > 0;
    const expanded = row.expanded !== false;

    const expandAttr = hasChildren
      ? ` aria-expanded="${expanded ? 'true' : 'false'}"`
      : '';
    const hiddenClass = hidden ? ' class="hidden"' : '';

    let html = `<tr role="row" aria-level="${level}" aria-posinset="${posInSet}" aria-setsize="${setSize}"${expandAttr}${hiddenClass}>`;
    const cells = row.cells || [];
    for (let c = 0; c < cells.length; c++) {
      html += this._buildCell(cells[c]);
    }
    html += '</tr>';

    if (hasChildren) {
      const childHidden = hidden || !expanded;
      for (let i = 0; i < children.length; i++) {
        html += this._buildRows(children[i], level + 1, i + 1, children.length, childHidden);
      }
    }
    return html;
  }

  _buildCell(cell) {
    if (cell == null || cell === '') return '<td role="gridcell"></td>';
    if (typeof cell === 'string') return `<td role="gridcell">${this._esc(cell)}</td>`;

    const cls = cell.className ? ` class="${this._esc(cell.className)}"` : '';
    const title = cell.title ? ` title="${this._esc(cell.title)}"` : '';
    let inner;
    if (cell.href) {
      inner = `<a href="${this._esc(cell.href)}">${this._esc(cell.text || '')}</a>`;
    } else if (cell.pill) {
      inner = `<span class="cell-pill">${this._esc(cell.text || '')}</span>`;
    } else {
      inner = this._esc(cell.text || '');
    }
    return `<td role="gridcell"${cls}${title}>${inner}</td>`;
  }

  // --- Event listeners ---

  _addEventListeners() {
    this._removeEventListeners();
    const tbody = this.shadowRoot.querySelector('tbody');
    tbody.addEventListener('keydown', this._onKeyDown);
    tbody.addEventListener('click', this._onClick);
    tbody.addEventListener('dblclick', this._onDblClick);
    tbody.addEventListener('focusin', this._onFocusIn);
  }

  _removeEventListeners() {
    const tbody = this.shadowRoot?.querySelector('tbody');
    if (!tbody) return;
    tbody.removeEventListener('keydown', this._onKeyDown);
    tbody.removeEventListener('click', this._onClick);
    tbody.removeEventListener('dblclick', this._onDblClick);
    tbody.removeEventListener('focusin', this._onFocusIn);
  }

  // --- DOM queries ---

  _getTbody() {
    return this.shadowRoot.querySelector('tbody');
  }

  _getAllRows() {
    return Array.from(this._getTbody().querySelectorAll('tr'));
  }

  _getAllNavigableRows() {
    return Array.from(this._getTbody().querySelectorAll('tr:not(.hidden)'));
  }

  _getNavigableCols(row) {
    return Array.from(row.getElementsByTagName('td'));
  }

  _getFocusableElements(root) {
    return Array.from(root.querySelectorAll('a,button,input,td>[tabindex]'));
  }

  // --- Focus management (roving tabindex) ---

  _initAttributes() {
    const tbody = this._getTbody();
    this._setTabIndexOfFocusableElements(tbody, -1);

    const rows = this._getAllRows();
    for (let i = rows.length - 1; i >= 0; i--) {
      rows[i].tabIndex = i === 0 ? 0 : -1;
    }
  }

  _setTabIndexForCell(cell, tabIndex) {
    const focusable = this._getFocusableElements(cell)[0] || cell;
    focusable.tabIndex = tabIndex;
  }

  _setTabIndexForCellsInRow(row, tabIndex) {
    for (const cell of this._getNavigableCols(row)) {
      this._setTabIndexForCell(cell, tabIndex);
    }
  }

  _setTabIndexOfFocusableElements(root, tabIndex) {
    for (const el of this._getFocusableElements(root)) {
      el.tabIndex = tabIndex;
    }
  }

  _focus(elem) {
    elem.tabIndex = 0;
    elem.focus();
  }

  _focusCell(cell) {
    const focusableChildren = this._getFocusableElements(cell);
    this._focus(focusableChildren[0] || cell);
  }

  _getRowWithFocus() {
    return this._getContainingRow(this.shadowRoot.activeElement);
  }

  _getContainingRow(start) {
    const tbody = this._getTbody();
    let el = start;
    if (tbody.contains(el)) {
      while (el !== tbody) {
        if (el.localName === 'tr') return el;
        el = el.parentElement;
      }
    }
    return null;
  }

  _isRowFocused() {
    return this._getRowWithFocus() === this.shadowRoot.activeElement;
  }

  _isEditableFocused() {
    return this.shadowRoot.activeElement?.localName === 'input';
  }

  _getColWithFocus(currentRow) {
    if (!currentRow) return null;
    let el = this.shadowRoot.activeElement;
    if (currentRow.contains(el)) {
      while (el !== currentRow) {
        if (el.localName === 'td') return el;
        el = el.parentElement;
      }
    }
    return null;
  }

  _enableTabbingInActiveRowDescendants(isTabbingOn, row) {
    if (!row) return;
    this._setTabIndexOfFocusableElements(row, isTabbingOn ? 0 : -1);
    if (isTabbingOn) {
      this._tabbingRow = row;
    } else if (this._tabbingRow === row) {
      this._tabbingRow = null;
    }
  }

  // --- Navigation ---

  _restrictIndex(index, numItems) {
    if (index < 0) return 0;
    return index >= numItems ? index - 1 : index;
  }

  _getLevel(row) {
    return row && parseInt(row.getAttribute('aria-level'));
  }

  _moveByRow(direction, requireLevelChange) {
    const currentRow = this._getRowWithFocus();
    const requiredLevel = requireLevelChange && currentRow
      && this._getLevel(currentRow) + direction;
    const rows = this._getAllNavigableRows();
    const numRows = rows.length;
    let rowIndex = currentRow ? rows.indexOf(currentRow) : -1;
    let maxDistance = requireLevelChange && direction === 1 ? 1 : NaN;

    do {
      if (maxDistance-- === 0) return;
      rowIndex = this._restrictIndex(rowIndex + direction, numRows);
    } while (requiredLevel && requiredLevel !== this._getLevel(rows[rowIndex]));

    if (!this._focusSameColInDifferentRow(currentRow, rows[rowIndex])) {
      this._focus(rows[rowIndex]);
    }
  }

  _focusSameColInDifferentRow(fromRow, toRow) {
    const currentCol = this._getColWithFocus(fromRow);
    if (!currentCol) return false;

    const fromCols = this._getNavigableCols(fromRow);
    const currentColIndex = fromCols.indexOf(currentCol);
    if (currentColIndex < 0) return false;

    const toCols = this._getNavigableCols(toRow);
    this._focusCell(toCols[currentColIndex]);
    return true;
  }

  _moveByCol(direction) {
    const currentRow = this._getRowWithFocus();
    if (!currentRow) return;

    const cols = this._getNavigableCols(currentRow);
    const numCols = cols.length;
    const currentCol = this._getColWithFocus(currentRow);
    const currentColIndex = cols.indexOf(currentCol);

    let newColIndex = currentCol || direction < 0
      ? currentColIndex + direction
      : 0;

    if (this._doAllowRowFocus && newColIndex < 0) {
      this._focus(currentRow);
      return;
    }
    newColIndex = this._restrictIndex(newColIndex, numCols);
    this._focusCell(cols[newColIndex]);
  }

  _moveToExtreme(direction) {
    const currentRow = this._getRowWithFocus();
    if (!currentRow) return;

    const currentCol = this._getColWithFocus(currentRow);
    if (currentCol) {
      this._moveToExtremeCol(direction, currentRow);
    } else {
      this._moveToExtremeRow(direction);
    }
  }

  _moveToExtremeCol(direction, currentRow) {
    const cols = this._getNavigableCols(currentRow);
    const desiredColIndex = direction < 0 ? 0 : cols.length - 1;
    this._focusCell(cols[desiredColIndex]);
  }

  _moveToExtremeRow(direction) {
    const rows = this._getAllNavigableRows();
    const newRow = rows[direction > 0 ? rows.length - 1 : 0];
    if (!this._focusSameColInDifferentRow(this._getRowWithFocus(), newRow)) {
      this._focus(newRow);
    }
  }

  // --- Expand / collapse ---

  _getAriaExpandedElem(row) {
    return row;
  }

  _setAriaExpanded(row, doExpand) {
    this._getAriaExpandedElem(row).setAttribute('aria-expanded', doExpand);
  }

  _isExpandable(row) {
    return this._getAriaExpandedElem(row).hasAttribute('aria-expanded');
  }

  _isExpanded(row) {
    return this._getAriaExpandedElem(row).getAttribute('aria-expanded') === 'true';
  }

  _toggleExpanded(row) {
    const cols = this._getNavigableCols(row);
    const currentCol = this._getColWithFocus(row);
    if (currentCol === cols[0] && this._isExpandable(row)) {
      this._changeExpanded(!this._isExpanded(row), row);
    }
  }

  _changeExpanded(doExpand, row) {
    const currentRow = row || this._getRowWithFocus();
    if (!currentRow) return false;

    const currentLevel = this._getLevel(currentRow);
    const rows = this._getAllRows();
    let rowIndex = rows.indexOf(currentRow);
    let didChange = false;
    const doExpandLevel = [];
    doExpandLevel[currentLevel + 1] = doExpand;

    while (++rowIndex < rows.length) {
      const nextRow = rows[rowIndex];
      const rowLevel = this._getLevel(nextRow);
      if (rowLevel <= currentLevel) break;

      doExpandLevel[rowLevel + 1] =
        doExpandLevel[rowLevel] && this._isExpanded(nextRow);
      const willHideRow = !doExpandLevel[rowLevel];
      const isRowHidden = nextRow.classList.contains('hidden');

      if (willHideRow !== isRowHidden) {
        nextRow.classList.toggle('hidden', willHideRow);
        didChange = true;
      }
    }

    if (didChange) {
      this._setAriaExpanded(currentRow, doExpand);
      return true;
    }
    return false;
  }

  // --- Event handlers ---

  _handleKeyDown(event) {
    const numModifiers = event.ctrlKey + event.altKey + event.shiftKey + event.metaKey;
    const ctrlOnly = numModifiers === 1 && event.ctrlKey;
    if (numModifiers > 0 && !ctrlOnly) return;

    switch (event.key) {
      case 'ArrowDown':
        this._moveByRow(1);
        break;
      case 'ArrowUp':
        this._moveByRow(-1);
        break;
      case 'ArrowLeft':
        if (this._isEditableFocused()) return;
        if (this._isRowFocused()) {
          this._changeExpanded(false) || this._moveByRow(-1, true);
        } else {
          this._moveByCol(-1);
        }
        break;
      case 'ArrowRight':
        if (this._isEditableFocused()) return;
        if (!this._isRowFocused() || !this._changeExpanded(true)) {
          this._moveByCol(1);
        }
        break;
      case 'Home':
        if (this._isEditableFocused()) return;
        ctrlOnly ? this._moveToExtremeRow(-1) : this._moveToExtreme(-1);
        break;
      case 'End':
        if (this._isEditableFocused()) return;
        ctrlOnly ? this._moveToExtremeRow(1) : this._moveToExtreme(1);
        break;
      case 'Enter':
        this._handlePrimaryAction();
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  _handlePrimaryAction() {
    const currentRow = this._getRowWithFocus();
    if (!currentRow) return;
    if (currentRow === this.shadowRoot.activeElement) return;
    this._toggleExpanded(currentRow);
  }

  _handleClick(event) {
    if (event.target.localName !== 'td') return;

    const row = this._getContainingRow(event.target);
    if (!this._isExpandable(row)) return;
    if (!event.target.firstChild) return;

    const range = document.createRange();
    range.selectNodeContents(event.target.firstChild);
    const left = range.getBoundingClientRect().left;
    const EXPANDO_WIDTH = 20;

    if (event.clientX < left && event.clientX > left - EXPANDO_WIDTH) {
      this._changeExpanded(!this._isExpanded(row), row);
    }
  }

  _handleDblClick(event) {
    const row = this._getContainingRow(event.target);
    if (row && this._isExpandable(row)) {
      this._changeExpanded(!this._isExpanded(row), row);
      event.preventDefault();
    }
  }

  _handleFocusIn(event) {
    const tbody = this._getTbody();
    const newTreeGridFocus =
      event.target !== window && tbody.contains(event.target) && event.target;

    const oldCurrentRow = this._tabbingRow;
    if (oldCurrentRow) {
      this._enableTabbingInActiveRowDescendants(false, oldCurrentRow);
    }
    if (
      this._prevTreeGridFocus &&
      this._prevTreeGridFocus.localName === 'td'
    ) {
      this._prevTreeGridFocus.removeAttribute('tabindex');
    }

    if (newTreeGridFocus) {
      if (oldCurrentRow) {
        oldCurrentRow.tabIndex = -1;
      }
      const currentRow = this._getRowWithFocus();
      if (currentRow) {
        currentRow.tabIndex = 0;
        this._enableTabbingInActiveRowDescendants(true, currentRow);
      }
    }

    this._prevTreeGridFocus = newTreeGridFocus;
  }

  // --- Styles ---

  _getStyles() {
    // Per-level indentation of the first cell. Generated up to a generous
    // depth so arbitrarily deep model trees stay readable.
    let indent = '';
    for (let level = 2; level <= 30; level++) {
      indent += `tr[aria-level="${level}"] > td:first-child { padding-left: ${(level - 1) * 2.5}ch; }\n`;
    }

    return `
      :host { display: block; }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 0.95rem;
      }
      tr { display: table-row; cursor: default; }
      th, td {
        padding: 4px 6px;
        overflow-wrap: break-word;
        vertical-align: top;
        text-align: left;
      }
      th {
        background-color: #F5F4F2;
        border-bottom: 2px solid #004B7A;
        font-weight: 500;
      }
      tbody td { cursor: default; }
      tbody tr:nth-child(odd) { background-color: #ffffff; }
      tbody tr:nth-child(even) { background-color: #f4f4f4; }

      tr > td:not(:first-child),
      tr > th:not(:first-child) {
        padding-left: 1ch;
      }

      tr:focus, td:focus, a:focus {
        outline: 3px solid #ffdd00;
        outline-offset: -1px;
        background-color: hsl(216deg 80% 97%);
      }

      a { color: var(--treegrid-link-color, #1d70b8); }
      a:visited { color: var(--treegrid-link-visited-color, #4c2c92); }
      a:hover { color: var(--treegrid-link-hover-color, #003078); }

      .cell-pill {
        display: inline-block;
        background-color: #1d70b8;
        color: #ffffff;
        padding: 1px 6px;
        font-size: 0.8em;
        font-weight: 600;
        border-radius: 3px;
        font-family: monospace;
      }

      tr.hidden { display: none; }

      ${indent}

      /* Collapse/expand icon on the first cell of expandable rows. */
      tr > td:first-child::before {
        font-family: monospace;
        content: " ";
        display: inline-block;
        width: 2ch;
        height: 11px;
        transition: transform 0.3s;
        transform-origin: 5px 5px;
      }

      tr[aria-expanded] > td:first-child::before {
        cursor: pointer;
        background-image:
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Cpolygon fill='black' points='2,0 2,10 10,5'%3E%3C/polygon%3E%3C/svg%3E%0A");
        background-repeat: no-repeat;
      }

      tr[aria-expanded="true"] > td:first-child::before {
        transform: rotate(90deg);
      }
    `;
  }
}

customElements.define('graph-treegrid', GraphTreeGrid);
