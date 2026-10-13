/**
 * Minimal FIFO counting semaphore used to bound expensive shared resources
 * (for example concurrent Playwright browser contexts) inside one process.
 */
function createSemaphore(limit) {
  const max = Math.max(1, Math.trunc(Number(limit) || 1));
  let active = 0;
  const waiters = [];

  const release = () => {
    const next = waiters.shift();
    if (next) next();
    else active = Math.max(0, active - 1);
  };

  const acquire = () =>
    new Promise((resolve) => {
      const grant = () => {
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          release();
        });
      };
      if (active < max) {
        active += 1;
        grant();
      } else waiters.push(grant);
    });

  return {
    acquire,
    get active() {
      return active;
    },
    get waiting() {
      return waiters.length;
    },
    limit: max,
  };
}

module.exports = { createSemaphore };
