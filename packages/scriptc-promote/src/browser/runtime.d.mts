export type BrowserSnapshot = {id:string;ready:boolean;disabled:boolean;lane:string;checks:number;mismatches:number;fallbacks:number;wasmCalls:number};
export declare function browserSnapshot(): BrowserSnapshot[];
