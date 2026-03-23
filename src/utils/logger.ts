const PREFIX = '[YieldTracker]';
const isDev = process.env.NODE_ENV === 'development';

export const log = isDev ? console.log.bind(console, PREFIX) : () => {};
export const warn = isDev ? console.warn.bind(console, PREFIX) : () => {};
export const error = console.error.bind(console, PREFIX);
