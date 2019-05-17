// JUST USED FOR EDUCATIONAL PURPOSES, IS NOT USED BY DIDACT-FIBER
// Example file for looking at how a scheduler using requestIdleCallback could work

const ENOUGH_TIME = 1; // milliseconds

let workQueue = [];
let nextUnitOfWork = null;

/**
 * Push an element to the FIFO queue, that will get executed when there's idle time in the browser
 * @param {object} task task to be executed
 */
const schedule = task => {
  workQueue.push(task);
  requestIdleCallback(performWork);
};

/**
 * Will loop through the work queue until we dont have more idle time in the browser, in that moment, will request another idle callback
 * @param {object} deadline object provided by requestIdleCallback with methods for knowing how much time we have to execute the callback
 *
 */
const performWork = deadline => {
  if (!nextUnitOfWork) {
    nextUnitOfWork = workQueue.shift();
  }
  while (nextUnitOfWork && deadline.timeRemaining() > ENOUGH_TIME) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork); // eslint-disable-line no-undef
  }

  if (nextUnitOfWork || workQueue.length) {
    requestIdleCallback(performWork);
  }
};

export default schedule;
