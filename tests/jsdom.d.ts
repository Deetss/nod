// jsdom ships no type declarations; the tests only need the window of an empty document.
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: Window & typeof globalThis;
  }
}
