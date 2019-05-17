const TEXT_ELEMENT_TYPE = "TEXT ELEMENT";

function createTextElement(value) {
  return createElement(TEXT_ELEMENT_TYPE, { nodeValue: value });
}

/**
 *
 * @param {string} html type element
 * @param {object} config Configuration for creating the element, this normally are converted as props
 * @param  {...any} args Children of the element
 */
export function createElement(type, config, ...args) {
  const props = Object.assign({}, config);
  // the [].concat... stuff is ussed for collapsing arrays from [x, [y, z]] to [x, y, z]
  const rawChildren = args.length > 0 ? [].concat(...args) : [];

  // JSX pass text childrens as strings instead of objects
  props.children = rawChildren
    .filter(c => c != null && c !== false)
    .map(c => (c instanceof Object ? c : createTextElement(c)));
  return { type, props };
}

export default createElement;
