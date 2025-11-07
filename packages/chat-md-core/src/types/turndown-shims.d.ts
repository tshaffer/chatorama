declare module 'turndown' {
  // Minimal shape that matches how you use it
  export default class TurndownService {
    constructor(opts?: any);
    use(plugin: any): this;
    addRule(
      key: string,
      rule: { filter: any; replacement: (...args: any[]) => string }
    ): void;
    turndown(input: string | Node): string;
  }
}

declare module 'turndown-plugin-gfm' {
  export const gfm: any;
}
