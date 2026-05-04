'use strict';

// W3C APG Treegrid for resource relations
// https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/
class RelationsTreeGrid extends HTMLElement {

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
    d.textContent = str;
    return d.innerHTML;
  }

  _render() {
    if (!this._data) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    const { outgoing, incoming, resolveModelName } = this._data;
    const label = this.getAttribute('aria-label') || 'Linked Resources';

    const groups = [];
    if (outgoing.length > 0) groups.push({ label: 'Outgoing', items: outgoing });
    if (incoming.length > 0) groups.push({ label: 'Incoming', items: incoming });
    const setSize = groups.length;

    let rows = '';
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      rows += this._buildGroupRow(group.label, group.items.length, g + 1, setSize);
      rows += this._buildChildRows(group.items, resolveModelName);
    }

    this.shadowRoot.innerHTML = `
      <style>${this._getStyles()}</style>
      <table role="treegrid" aria-label="${this._esc(label)}">
        <colgroup>
          <col class="col-name">
          <col class="col-model">
          <col class="col-predicate">
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Resource Name</th>
            <th scope="col">Model Type</th>
            <th scope="col">Relationship</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    this._initAttributes();
    this._addEventListeners();
  }

  _buildGroupRow(label, childCount, posInSet, setSize) {
    return `<tr role="row"
        aria-level="1"
        aria-expanded="true"
        aria-posinset="${posInSet}"
        aria-setsize="${setSize}">
      <td role="gridcell">${this._esc(label)} (${childCount})</td>
      <td role="gridcell"></td>
      <td role="gridcell"></td>
    </tr>`;
  }

  _buildChildRows(relations, resolveModelName) {
    let html = '';
    for (let i = 0; i < relations.length; i++) {
      const r = relations[i];
      // info.model from Rós Madair is already the display name (graph.name.get("en")),
      // fall back to resolveModelName (graphId→wkrm lookup) for older indexes
      const modelName = r.modelName
        || (r.graphId && resolveModelName ? (resolveModelName(r.graphId) || '') : '');
      html += `<tr role="row"
          aria-level="2"
          aria-posinset="${i + 1}"
          aria-setsize="${relations.length}">
        <td role="gridcell">
          <a href="?slug=${encodeURIComponent(r.slug)}&full=true">${this._esc(r.name || '(untitled)')}</a>
        </td>
        <td role="gridcell">${this._esc(modelName)}</td>
        <td role="gridcell">${this._esc(r.predicate)}</td>
      </tr>`;
    }
    return html;
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
    return `
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      tr { display: table-row; cursor: default; }
      th, td {
        padding-bottom: 3px;
        overflow-wrap: break-word;
        vertical-align: top;
      }
      th { text-align: left; background-color: #eee; }
      tbody td { cursor: default; }
      tbody tr:nth-child(odd) { background-color: #eeeeee; }
      tbody tr:nth-child(even) { background-color: #f4f4f4; }

      .col-name { width: 45%; }
      .col-model { width: 25%; }
      .col-predicate { width: 30%; }

      tr > td:not(:first-child),
      tr > th:not(:first-child) {
        padding-left: 3ch;
      }

      tr:focus, td:focus, a:focus {
        outline: 2px solid hsl(216deg 94% 70%);
        background-color: hsl(216deg 80% 97%);
      }
      a { padding-left: 0.25ch; padding-right: 0.25ch; color: var(--treegrid-link-color, #1d70b8); }
      a:visited { color: var(--treegrid-link-visited-color, #4c2c92); }
      a:hover { color: var(--treegrid-link-hover-color, var(--treegrid-link-visited-color, #003078)); }
      a:focus { border-bottom: none; }

      tr.hidden { display: none; }

      tr[aria-level="2"] > td:first-child { padding-left: 2.5ch; }

      /* Collapse/expand icons */
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
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Cpolygon fill='black' points='2,0 2,10 10,5'%3E%3C/polygon%3E%3C/svg%3E%0A"),
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Cpolygon fill='hsl(216, 94%25, 50%25)' points='2,0 2,10 10,5'%3E%3C/polygon%3E%3C/svg%3E%0A");
        background-repeat: no-repeat;
      }

      tr[aria-expanded="true"] > td:first-child::before {
        transform: rotate(90deg);
      }

      tr[aria-expanded]:focus > td:first-child::before,
      tr[aria-expanded] > td:focus:first-child::before {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Cpolygon fill='hsl(216, 94%25, 50%25)' points='2,0 2,10 10,5'%3E%3C/polygon%3E%3C/svg%3E%0A");
      }
    `;
  }
}

customElements.define('relations-treegrid', RelationsTreeGrid);
