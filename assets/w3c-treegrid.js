'use strict';
import { marked } from 'marked';

// W3C APG Treegrid — https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/
class TreeGrid extends HTMLElement {

  // --- State ---

  _prevTreeGridFocus = null;
  _tabbingRow = null;
  _data = null;
  _connected = false;

  // Focus mode from URL ?cell= parameter
  _cellParam = new URLSearchParams(window.location.search).get('cell');
  _doAllowRowFocus = this._cellParam !== 'force';
  _doStartRowFocus = this._doAllowRowFocus && this._cellParam !== 'start';

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
    this._render();
  }

  disconnectedCallback() {
    this._connected = false;
    this._removeEventListeners();
  }

  // --- Public API ---

  get data() {
    return this._data;
  }

  set data(value) {
    this._data = value;
    if (this._connected) {
      this._render();
    }
  }

  // --- Rendering ---

  async _render() {
    const label = this.getAttribute('aria-label') || 'Tree Grid';
    const rows = this._data
      ? await this._buildRows(this._data.listItems, this._data.nodeObjectsByAlias, 1, false)
      : '';

    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" type="text/css" href="/css/w3c-treegrid.css">
      <div id="treegrid" class="table-wrap">
        <table id="treegrid-table"
               role="treegrid"
               aria-label="${this._esc(label)}">
          <colgroup>
            <col id="treegrid-col1">
            <col id="treegrid-col2">
            <col id="treegrid-col3">
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Node Name</th>
              <th scope="col">Value</th>
              <th scope="col">Node Alias</th>
              <th scope="col">Data Type</th>
            </tr>
          </thead>
          <tbody id="treegrid-body">
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    if (this._data) {
      this._initAttributes();
      this._addEventListeners();
    }
  }

  async _buildRows(items, nodeObjectsByAlias, level, hidden) {
    if (!items || typeof items !== 'object') return '';

    const entries = Object.entries(items).sort(
      (a, b) => a[0].localeCompare(b[0])
    );
    let html = '';

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];

      // Skip internal keys (e.g. __clean from alizarin Cleanable)
      if (key.startsWith('__')) continue;

      const node = nodeObjectsByAlias.get(key);
      if (!node) continue;

      const posInSet = i + 1;
      const setSize = entries.length;

      // Leaf node (primitives, null, or String objects like Cleanable)
      if (value == null || value instanceof String || typeof value !== 'object') {
        html += `
          <tr role="row"
              aria-level="${level}"
              aria-posinset="${posInSet}"
              aria-setsize="${setSize}"${hidden ? ' class="hidden"' : ''}>
            <td role="gridcell">${this._esc(node.name)}</td>
            <td role="gridcell">${value != null ? await marked.parse(`${value}`) : '<em>(empty)</em>'}</td>
            <td role="gridcell">${this._esc(node.alias)}</td>
            <td role="gridcell">${this._esc(node.datatype)}</td>
          </tr>`;

      // Branch node
      } else {
        const empty = Object.keys(value).length === 0;
        const expanded = !(Array.isArray(value) && value.length > 5) && !empty;
        const hideChildren = hidden || !expanded;

        html += `
          <tr role="row"
              aria-level="${level}"
              aria-posinset="${posInSet}"
              aria-setsize="${setSize}"${hidden ? ' class="hidden"' : ''}
              aria-expanded="${expanded}">
            <td role="gridcell">${this._esc(node.name)}</td>
            <td role="gridcell">${empty ? '<em>(empty)</em>' : ''}</td>
            <td role="gridcell">${this._esc(node.alias)}</td>
            <td role="gridcell">${this._esc(node.datatype)}</td>
          </tr>`;

        if (Array.isArray(value)) {
          for (let m = 0; m < value.length; m++) {
            const nested = value[m] != null && typeof value[m] === 'object' && !(value[m] instanceof String);
            html += `
              <tr role="row"
                  aria-level="${level + 1}"
                  aria-posinset="${m + 1}"
                  aria-setsize="${value.length}"${hideChildren ? ' class="hidden"' : ''}
                  ${nested ? `aria-expanded="${!hideChildren}"` : ''}>
                <td role="gridcell">[ ${m + 1} / ${value.length} ]</td>
                <td role="gridcell">${nested ? '' : await marked.parse(String(value[m]))}</td>
                <td role="gridcell">${this._esc(node.alias)}</td>
                <td role="gridcell">${this._esc(node.datatype)}</td>
              </tr>`;
            if (nested) {
              html += await this._buildRows(value[m], nodeObjectsByAlias, level + 2, hideChildren);
            }
          }
        } else {
          html += await this._buildRows(value, nodeObjectsByAlias, level + 1, hideChildren);
        }
      }
    }
    return html;
  }

  _esc(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Event listeners ---

  _addEventListeners() {
    this._removeEventListeners();
    const tbody = this.shadowRoot.querySelector('#treegrid-body');
    tbody.addEventListener('keydown', this._onKeyDown);
    tbody.addEventListener('click', this._onClick);
    tbody.addEventListener('dblclick', this._onDblClick);
    tbody.addEventListener('focusin', this._onFocusIn);
  }

  _removeEventListeners() {
    const tbody = this.shadowRoot?.querySelector('#treegrid-body');
    if (!tbody) return;
    tbody.removeEventListener('keydown', this._onKeyDown);
    tbody.removeEventListener('click', this._onClick);
    tbody.removeEventListener('dblclick', this._onDblClick);
    tbody.removeEventListener('focusin', this._onFocusIn);
  }

  // --- DOM queries ---

  _getTbody() {
    return this.shadowRoot.querySelector('#treegrid-body');
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
    const startRowIndex = this._doStartRowFocus ? 0 : -1;

    for (let i = rows.length - 1; i >= 0; i--) {
      if (this._doAllowRowFocus) {
        rows[i].tabIndex = i === startRowIndex ? 0 : -1;
      } else {
        this._setTabIndexForCellsInRow(rows[i], -1);
        this._moveAriaExpandedToFirstCell(rows[i]);
      }
    }

    if (this._doStartRowFocus) return;
    const firstCell = this._getNavigableCols(rows[0])[0];
    this._setTabIndexForCell(firstCell, 0);
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
    return this._doAllowRowFocus ? row : this._getNavigableCols(row)[0];
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

  _moveAriaExpandedToFirstCell(row) {
    const expandedValue = row.getAttribute('aria-expanded');
    const firstCell = this._getNavigableCols(row)[0];
    if (expandedValue) {
      firstCell.setAttribute('aria-expanded', expandedValue);
      row.removeAttribute('aria-expanded');
    }
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
      this._doAllowRowFocus &&
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

}

customElements.define('tree-grid', TreeGrid);
