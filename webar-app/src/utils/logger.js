// Silent logger for production — never logs to console in the app
// Keeps the calls so code compiles, but outputs nothing on device
const noop = () => {};
export const log   = noop;
export const warn  = noop;
export const error = noop;
