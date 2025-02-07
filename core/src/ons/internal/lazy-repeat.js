/*
Copyright 2013-2015 ASIAL CORPORATION

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

import util from '../util';
import platform from '../platform';

/* eslint-disable key-spacing */
const scheme = {
  createItemContent:   {type: 'function', returns: Element},
  countItems:          {type: 'function', returns: 'number'},
  calculateItemHeight: {type: 'function', returns: 'number'},
  updateItemContent:   {type: 'function', safeCall: true},
  destroy:             {type: 'function', safeCall: true},
  destroyItem:         {type: 'function', safeCall: true},
  _render:             {type: 'function', safeCall: true}
};
/* eslint-enable key-spacing */

export class LazyRepeatDelegate {

  constructor(userDelegate, templateElement = null) {
    this._userDelegate = util.validated('delegate', userDelegate, 'object');
    this._templateElement = util.validated('templateElement', templateElement, [Element, 'null']);
  }

  get itemHeight() {
    return this._userDelegate.itemHeight;
  }

  _validated(key, _scheme = scheme) {
    return util.validated(key, null, util.extend({}, _scheme[key], {
      dynamicCall: {object: this._userDelegate, key}
    }));
  }

  /**
   * @return {Boolean}
   */
  hasRenderFunction() {
    return this._userDelegate._render !== undefined;
  }

  /**
   * @return {void}
   */
  _render(items, height) {
    this._validated('_render')(items, height);
  }

  /**
   * @param {Number}
   * @param {Function} done A function that take item object as parameter.
   */
  prepareItem(index, done) {
    return done({
      element: this._validated('createItemContent')(index, this._templateElement)
    });
  }

  /**
   * @return {Number}
   */
  countItems() {
    return this._validated('countItems')();
  }

  /**
   * @param {Number} index
   * @param {Object} item
   * @param {Element} item.element
   */
  updateItem(index, item) {
    return this._validated('updateItemContent')(index, item);
  }

  /**
   * @return {Number}
   */
  calculateItemHeight(index) {
    return this._validated('calculateItemHeight')(index);
  }

  /**
   * @param {Number} index
   * @param {Object} item
   */
  destroyItem(index, item) {
    return this._validated('destroyItem')(index, item);
  }

  /**
   * @return {void}
   */
  destroy() {
    this._validated('destroy')();
    this._userDelegate = this._templateElement = null;
  }
}

/**
 * This class provide core functions for ons-lazy-repeat.
 */
export class LazyRepeatProvider {

  /**
   * @param {Element} wrapperElement
   * @param {LazyRepeatDelegate} delegate
   */
  constructor(wrapperElement, delegate) {
    this._wrapperElement = util.validated('wrapperElement', wrapperElement, Element);
    this._delegate = util.validated('delegate', delegate, LazyRepeatDelegate);

    if (wrapperElement.tagName.toLowerCase() === 'ons-list') {
      wrapperElement.classList.add('lazy-list');
    }

    // to be removed soon
    this._pageContent = util.findParent(wrapperElement, '.ons-scroller__content');

    if (!this._pageContent) {
      this._pageContent = util.findParent(wrapperElement, '.page__content');
    }

    if (!this._pageContent) {
      throw new Error('ons-lazy-repeat must be a descendant of an <ons-page> or an <ons-scroller> element.');
    }

    this._topPositions = [];
    this._renderedItems = {};

    try {
      this._delegate.itemHeight || this._delegate.calculateItemHeight(0);
    } catch (e) {
      if (!/must be (a|an instance of) function/.test('' + e)) {
        throw e;
      }
      this._unknownItemHeight = true;
    }
    this._addEventListeners();
    this._onChange();
  }

  _checkItemHeight(callback) {
    this._delegate.prepareItem(0, ({element}) => {
      if (this._unknownItemHeight) {
        this._wrapperElement.appendChild(element);
        this._itemHeight = element.offsetHeight;
        this._wrapperElement.removeChild(element);
        delete this._unknownItemHeight;
        callback();
      }
    });
  }

  get staticItemHeight() {
    return this._delegate.itemHeight || this._itemHeight;
  }

  _countItems() {
    return this._delegate.countItems();
  }

  _getItemHeight(i) {
    return this.staticItemHeight || this._delegate.calculateItemHeight(i);
  }

  _onChange() {
    this._render();
  }

  refresh() {
    this._removeAllElements();
    this._onChange();
  }

  _render() {
    if (this._unknownItemHeight) {
      return this._checkItemHeight(this._render.bind(this));
    }

    const items = this._getItemsInView();

    if (this._delegate.hasRenderFunction && this._delegate.hasRenderFunction()) {
      this._delegate._render(items, this._listHeight);
      return null;
    }

    const keep = {};

    items.forEach(item => {
      this._renderElement(item);
      keep[item.index] = true;
    });

    Object.keys(this._renderedItems).forEach(key => keep[key] || this._removeElement(key));

    this._wrapperElement.style.height = this._listHeight + 'px';
  }

  /**
   * @param {Object} item
   * @param {Number} item.index
   * @param {Number} item.top
   */
  _renderElement({index, top}) {
    let item = this._renderedItems[index];
    if (item) {
      this._delegate.updateItem(index, item); // update if it exists
      item.element.style.top = top + 'px';
      return;
    }

    this._delegate.prepareItem(index, (item) => {
      util.extend(item.element.style, {
        position: 'absolute',
        top: top + 'px',
        left: 0,
        right: 0
      });

      this._wrapperElement.appendChild(item.element);
      this._renderedItems[index] = item;
    });
  }

  /**
   * @param {Number} index
   */
  _removeElement(index) {
    let item = this._renderedItems[index];

    this._delegate.destroyItem(index, item);

    if (item.element.parentElement) {
      item.element.parentElement.removeChild(item.element);
    }

    delete this._renderedItems[index];
  }

  _removeAllElements() {
    Object.keys(this._renderedItems).forEach(key => this._removeElement(key));
  }

  _calculateStartIndex(current) {
    let start = 0;
    let end = this._itemCount - 1;

    if (this.staticItemHeight) {
      return parseInt(-current / this.staticItemHeight);
    }

    // Binary search for index at top of screen so we can speed up rendering.
    for (;;) {
      const middle = Math.floor((start + end) / 2);
      const value = current + this._topPositions[middle];

      if (end < start) {
        return 0;
      } else if (value <= 0 && value + this._getItemHeight(middle) > 0) {
        return middle;
      } else if (isNaN(value) || value >= 0) {
        end = middle - 1;
      } else {
        start = middle + 1;
      }
    }
  }

  _recalculateTopPositions() {
    let l = Math.min(this._topPositions.length, this._itemCount);
    this._topPositions[0] = 0;
    for (let i = 1, l; i < l; i++) {
      this._topPositions[i] = this._topPositions[i - 1] + this._getItemHeight(i);
    }
  }

  _getItemsInView() {
    const offset = this._wrapperElement.getBoundingClientRect().top;
    const limit = 4 * window.innerHeight - offset;
    const count = this._countItems();

    if (count !== this._itemCount){
      this._itemCount = count;
      this._recalculateTopPositions();
    }

    let i = Math.max(0, this._calculateStartIndex(offset) - 30);

    const items = [];
    for (var top = this._topPositions[i]; i < count && top < limit; i++) {
      if (i >= this._topPositions.length) { // perf optimization
        this._topPositions.length += 100;
      }

      this._topPositions[i] = top;
      items.push({top, index: i});
      top += this._getItemHeight(i);
    }
    this._listHeight = top;

    return items;
  }

  _debounce(func, wait, immediate) {
    let timeout;
    return function() {
      let callNow = immediate && !timeout;
      clearTimeout(timeout);
      if (callNow) {
        func.apply(this, arguments);
      } else {
        timeout = setTimeout(() => {
          timeout = null;
          func.apply(this, arguments);
        }, wait);
      }
    };
  }

  _doubleFireOnTouchend() {
    this._render();
    this._debounce(this._render.bind(this), 100);
  }

  _addEventListeners() {
    util.bindListeners(this, ['_onChange', '_doubleFireOnTouchend']);

    if (platform.isIOS()) {
      this._boundOnChange = this._debounce(this._boundOnChange, 30);
    }

    this._pageContent.addEventListener('scroll', this._boundOnChange, true);

    if (platform.isIOS()) {
      this._pageContent.addEventListener('touchmove', this._boundOnChange, true);
      this._pageContent.addEventListener('touchend', this._boundDoubleFireOnTouchend, true);
    }

    window.document.addEventListener('resize', this._boundOnChange, true);
  }

  _removeEventListeners() {
    this._pageContent.removeEventListener('scroll', this._boundOnChange, true);

    if (platform.isIOS()) {
      this._pageContent.removeEventListener('touchmove', this._boundOnChange, true);
      this._pageContent.removeEventListener('touchend', this._boundDoubleFireOnTouchend, true);
    }

    window.document.removeEventListener('resize', this._boundOnChange, true);
  }

  destroy() {
    this._removeAllElements();
    this._delegate.destroy();
    this._parentElement = this._delegate = this._renderedItems = null;
    this._removeEventListeners();
  }
}

