// helpers functions
const isEvent = name => name.startsWith("on");
const isAttribute = name =>
  !isEvent(name) && name !== "children" && name !== "style";
const isNew = (prev, next) => key => prev[key] !== next[key];
const isGone = (_, next) => key => !(key in next);

const TEXT_ELEMENT_TYPE = "TEXT ELEMENT";
/**
 * Update the attributes and event listeners of a dom element
 * @param {object} dom dom element reference
 * @param {*} prevProps previous props of the dom element
 * @param {*} nextProps new props of the dom element
 */
export const updateDomProperties = (dom, prevProps, nextProps) => {
  // remove listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter(key => !(key in nextProps) || isNew(prevProps, nextProps)(key)) // we only remove whatever changed or doesnt exist anymore
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });
  // remove attributes
  Object.keys(prevProps)
    .filter(isAttribute)
    .filter(isGone(prevProps, nextProps)) // only remove the attributes that are gone
    .forEach(name => {
      dom[name] = null;
    });
  // add the attributes (whatever doesn't start with 'on')
  Object.keys(nextProps)
    .filter(isAttribute)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      dom[name] = nextProps[name];
    });

  // set style prop
  prevProps.style = prevProps.style || {};
  nextProps.style = nextProps.style || {};

  // add the new styles
  Object.keys(nextProps.style)
    .filter(isNew(prevProps.style, nextProps.style))
    .forEach(key => {
      dom.style[key] = nextProps.style[key];
    });

  // remove the styles that are gone
  Object.keys(prevProps.style)
    .filter(isGone(prevProps.style, nextProps.style))
    .forEach(key => {
      dom.style[key] = "";
    });

  // add the event listeners (based on the name of the prop, if it starts with 'on')
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2); // we don't care about the 'on' on the string
      dom.addEventListener(eventType, nextProps[name]);
    });
};

export const createDomElement = fiber => {
  const isTextElement = fiber.type === TEXT_ELEMENT_TYPE;
  const dom = isTextElement
    ? document.createTextNode("")
    : document.createElement(fiber.type);
  updateDomProperties(dom, {}, fiber.props);
  return dom;
};
