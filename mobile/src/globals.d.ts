/**
 * Globals the shared web game code expects. Hermes provides structuredClone
 * natively on modern RN; the declaration keeps tsc happy, and
 * src/platform/polyfills.ts installs a fallback on older runtimes.
 */
declare function structuredClone<T>(value: T): T;
