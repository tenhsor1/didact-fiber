import { createDomElement, updateDomProperties } from "./dom-utils";
import { arrify } from "./utils";

// Fiber tags
const HOST_COMPONENT = "host";
const CLASS_COMPONENT = "class";
const HOST_ROOT = "root";

// Effect tags
const PLACEMENT = 1;
const DELETION = 2;
const UPDATE = 3;

// Global state for scheduling
const updateQueue = [];
let nextUnitOfWork = null;
let pendingCommit = null;

/**
 * reconcile elements in the container dom
 * @param {array of objects} elements elements to be reconciled to the containerDom
 * @param {*} containerDom dom element working as container
 */
export const render = (elements, containerDom) => {
  updateQueue.push({
    from: HOST_ROOT,
    dom: containerDom,
    newProps: {
      children: elements
    }
  });
  requestIdleCallback(performWork);
};

/**
 * Based on a new state, will update the fiber tree
 * @param {object} instance Instance of the class where the state changed
 * @param {*} partialState the new partial state
 */
export const scheduleUpdate = (instance, partialState) => {
  updateQueue.push({
    from: CLASS_COMPONENT,
    instance,
    partialState
  });
  requestIdleCallback(performWork);
};

const ENOUGH_TIME = 1; // milliseconds

/**
 * trigger a workloop based on the queueUpdate FIFO, if theres still elements on the queue after the workloop, request another idle callback
 * @param {object} deadline object provided by requestIdleCallback with methods for knowing how much time we have to execute the callback
 *
 */
const performWork = deadline => {
  workLoop(deadline);
  if (nextUnitOfWork || updateQueue.length > 0) {
    requestIdleCallback(performWork);
  }
};

/**
 * Will iterate through the next unit of works that we get from the updateQueue, until there's no more idle time.
 * if the iteration finishtes and there's pending commits, will commit all the work
 * @param {object} deadline object provided by requestIdleCallback with methods for knowing how much time we have to execute the callback
 */
const workLoop = deadline => {
  if (!nextUnitOfWork) {
    resetNextUnitOfWork();
  }
  while (nextUnitOfWork && deadline.timeRemaining() > ENOUGH_TIME) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }
  if (pendingCommit) {
    commitAllWork(pendingCommit);
  }
};

/**
 * It will reset the next unit of work to be the host root for our new work-in-progress tree
 */
const resetNextUnitOfWork = () => {
  const update = updateQueue.shift();
  if (!update) {
    return;
  }
  // copy the setState parameter from the update payload to the corresponding fiber
  if (update.partialState) {
    update.instance.__fiber.partialState = update.partialState;
  }

  const root =
    update.from === HOST_ROOT
      ? update.dom.__rootContainerFiber
      : getRoot(update.instance.__fiber);

  nextUnitOfWork = {
    tag: HOST_ROOT,
    stateNode: update.dom || root.stateNode,
    props: update.newProps || root.props,
    alternate: root
  };
};
/**
 * iterate from the fiber up in the tree to get the root element
 * @param {object} fiber the fiber we want to get the root parent
 */
const getRoot = fiber => {
  let node = fiber;
  while (node.parent) {
    node = node.parent;
  }
  return node;
};

/**
 * Will perform the work on the fiber passed as parameter, and will return it child if it has
 * if not, will mark it as complete and will go up in the tree, marking the parents as completed.
 * It will check for siblings too in the fiber parameter and in it parents.
 * @param {object} wipFiber fiber where we gonna perform the work
 */
const performUnitOfWork = wipFiber => {
  beginWork(wipFiber);
  if (wipFiber.child) {
    return wipFiber.child;
  }

  // No child, we call completeWork until we find a sibling in one of the parents
  let unitOfWork = wipFiber;
  while (unitOfWork) {
    completeWork(unitOfWork);
    if (unitOfWork.sibling) {
      // siblings need to beginWork
      return unitOfWork.sibling;
    }
    unitOfWork = unitOfWork.parent;
  }
};

/**
 * will update (or create) the stateNode of the fiber, and reconcile it children
 * @param {*} wipFiber the work in progress fiber
 */
const beginWork = wipFiber => {
  if (wipFiber.tag === CLASS_COMPONENT) {
    updateClassComponent(wipFiber);
  } else {
    updateHostComponent(wipFiber);
  }
};

/**
 * will update the stateNode of the host component fiber, and reconcile it children
 * @param {*} wipFiber the work in progress fiber
 */
const updateHostComponent = wipFiber => {
  if (!wipFiber.stateNode) {
    wipFiber.stateNode = createDomElement(wipFiber);
  }
  const newChildElements = wipFiber.props.children;
  reconcileChildrenArray(wipFiber, newChildElements);
};

/**
 * will update the stateNode, props and state of the class component fiber, and reconcile it children
 * @param {*} wipFiber the work in progress fiber
 */
const updateClassComponent = wipFiber => {
  let instance = wipFiber.stateNode;
  if (instance == null) {
    // Call Class Constructor
    instance = wipFiber.stateNode = createInstance(wipFiber);
  } else if (wipFiber.props === instance.props && !wipFiber.partialState) {
    // if props are the same, and there's no new state, there's no need to rerender, just clone the children
    cloneChildFibers(wipFiber);
    return;
  }
  instance.props = wipFiber.props;
  instance.state = Object.assign({}, instance.state, wipFiber.partialState);
  wipFiber.partialState = null;
  const newChildElements = wipFiber.stateNode.render();
  reconcileChildrenArray(wipFiber, newChildElements);
};

/**
 * Create a class component instance
 * @param {object} fiber fiber unit used for creating a class component instance
 */
const createInstance = fiber => {
  const instance = new fiber.type(fiber.props);
  instance.__fiber = fiber;
  return instance;
};

/**
 * Reconcile fiber based on comparison between it old children and the newChildElements
 * @param {*} wipFiber the fiber that will be used to compare it child against the newChildElements
 * @param {*} newChildElements the new child elements to be compared against the fiber children
 */
const reconcileChildrenArray = (wipFiber, newChildElements) => {
  const elements = arrify(newChildElements);
  let index = 0;

  // we got the child of the old child of thw wip fiber we are reconciling
  let oldFiber = wipFiber.alternate ? wipFiber.alternate.child : null;
  let newFiber = null; // we need this reference outside of the loop, so we can start using it for link it with the siblings for each new sibling we create

  // we gonna compare each of the new elements with the old fibers starting from the child and going through all the siblings
  while (index < elements.length || oldFiber != null) {
    const prevFiber = newFiber;
    const element = index < elements.length && elements[index];
    const sameType = oldFiber && element && element.type == oldFiber.type;

    if (sameType) {
      // if the oldFiber and the element are the same type, we only update the props and the tag will be UPDATE
      newFiber = {
        type: oldFiber.type,
        tag: oldFiber.tag,
        stateNode: oldFiber.stateNode,
        props: element.props,
        parent: wipFiber,
        alternate: oldFiber,
        partialState: oldFiber.partialState,
        effectTag: UPDATE
      };
    }

    if (element && !sameType) {
      // if the oldFiber and the element have different types, or we dont have an old fiber, we create a new Fiber
      // this new fiber doesnt have an alternate nor a stateNode (will be created on the beginWork())
      newFiber = {
        type: element.type,
        tag:
          typeof element.type === "string" ? HOST_COMPONENT : CLASS_COMPONENT,
        props: element.props,
        parent: wipFiber,
        effectTag: PLACEMENT
      };
    }

    if (oldFiber && !sameType) {
      // if the old fiber and the element doesnt have the same type, or the element doesnt exist (got removed)
      // we gonna delete the old fiber, we will do that adding it to the effects list
      oldFiber.effectTag = DELETION;
      wipFiber.effects = wipFiber.effects || [];
      wipFiber.effects.push(oldFiber);
    }

    if (oldFiber) {
      // for the next cycle, we gonna consider the next sibling as the oldFiber
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      // update the parentFiber with the new fiber as it child
      wipFiber.child = newFiber;
    } else if (prevFiber && element) {
      // update the previous child to have a reference to it sibling
      prevFiber.sibling = newFiber;
    }
    index++;
  }
};

/**
 * Will iterate through all the parentFiber children and clone them, with the new reference on the alternate attribute.
 * @param {object} parentFiber target fiber for cloning it children
 */
const cloneChildFibers = parentFiber => {
  const oldFiber = parentFiber.alternate;
  if (!oldFiber.child) {
    return;
  }

  let oldChild = oldFiber.child;
  let prevChild = null;
  while (oldChild) {
    const newChild = {
      type: oldChild.type,
      tag: oldChild.tag,
      stateNode: oldChild.stateNode,
      props: oldChild.props,
      partialState: oldChild.partialState,
      alternate: oldChild,
      parent: parentFiber
    };

    if (prevChild) {
      prevChild.sibling = newChild;
    } else {
      parentFiber.child = newChild;
    }
    prevChild = newChild;
    oldChild = oldChild.sibling;
  }
};

/**
 * Get the fiber effects and pass them to the parent, if is the root, then mark it as pending commit
 * The idea is to accumulate all the effects with an effectTag in the root
 * @param {object} fiber fiber that will be marked as complete
 */
const completeWork = fiber => {
  if (fiber.tag === CLASS_COMPONENT) {
    fiber.stateNode.__fiber = fiber;
  }

  if (fiber.parent) {
    const childEffects = fiber.effects || [];
    const thisEffect = fiber.effectTag !== null ? [fiber] : [];
    const parentEffects = fiber.parent.effects || [];
    fiber.parent.effects = parentEffects.concat(childEffects, thisEffect);
  } else {
    pendingCommit = fiber;
  }
};

/**
 * For each effect in the effect list from the root fiber, we gonna commit it work (update the DOM)
 * after finished, reset the pending commit and the next unit of work to null
 * @param {object} fiber root fiber used for commiting all the effects
 */
const commitAllWork = fiber => {
  fiber.effects.forEach(f => {
    commitWork(f);
  });
  fiber.stateNode.__rootContainerFiber = fiber;
  nextUnitOfWork = null;
  pendingCommit = null;
};

/**
 * Based on the fiber, will commit the work updating the dom depending on it effectTag
 * @param {object} fiber fiber that will be used for updating the dom
 */
const commitWork = fiber => {
  if (fiber.tag === HOST_ROOT) {
    return;
  }

  // find the first parent that is not a class component
  let domParentFiber = fiber.parent;
  while (domParentFiber.tag === CLASS_COMPONENT) {
    domParentFiber = domParentFiber.parent;
  }
  // get it dom reference
  const domParent = domParentFiber.stateNode;

  if (fiber.effectTag === PLACEMENT && fiber.tag === HOST_COMPONENT) {
    // if the fiber is a dom type, and it effectTag is placement, append it to the parent
    domParent.appendChild(fiber.stateNode);
  } else if (fiber.effectTag === UPDATE) {
    // if is an update, then we update the attributes and listeners of the element, based on the prev and new props of the fiber
    updateDomProperties(fiber.stateNode, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === DELETION) {
    // if is a deletion, we remove it from the dom
    commitDeletion(fiber, domParent);
  }
};

const commitDeletion = (fiber, domParent) => {
  let node = fiber;
  while (node) {
    if (node.tag === CLASS_COMPONENT) {
      node = node.child;
      continue;
    }
    domParent.removeChild(node.stateNode);
    while (node !== fiber && !node.sibling) {
      node = node.parent;
    }
    if (node === fiber) {
      return;
    }
    node = node.sibling;
  }
};
