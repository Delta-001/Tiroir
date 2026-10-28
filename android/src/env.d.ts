declare namespace JSX {
    interface IntrinsicElements { [name: string]: any; }
    interface Element { [k: string]: any; }
    interface IntrinsicAttributes { key?: any; }
}
declare const console: { log(...a: any[]): void; error(...a: any[]): void; };
declare function setTimeout(fn: () => void, ms?: number): any;
declare function clearTimeout(t: any): void;
declare function setInterval(fn: () => void, ms?: number): any;
declare function clearInterval(t: any): void;
