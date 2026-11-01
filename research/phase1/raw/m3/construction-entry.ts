import {serialize,resultContainer} from './json.ts';
import {revenueCore as f0} from './module-0.ts';
function constructionResult0_1(v:string):boolean {return typeof v==="string";}
function constructionResult0_2(v:string):boolean {return typeof v==="string";}
function constructionResult0_3(v:number):boolean {return typeof v==="number"&&Number.isFinite(v);}
function constructionResult0_4(v:number):boolean {return typeof v==="number"&&Number.isFinite(v);}
function constructionResult0_7(v:string):boolean {return typeof v==="string";}
function constructionResult0_8(v:string):boolean {return typeof v==="string";}
function constructionResult0_9(v:number):boolean {return typeof v==="number"&&Number.isFinite(v);}
function constructionResult0_10(v:number):boolean {return typeof v==="number"&&Number.isFinite(v);}
function constructionResult0_11(v:number):boolean {return typeof v==="number"&&Number.isFinite(v);}
function constructionResult0_6(v:{"day":string;"region":string;"revenueCents":number;"units":number;"events":number}):boolean {if(v===null||typeof v!=="object")return false;if(!constructionResult0_7(v["day"]))return false;if(!constructionResult0_8(v["region"]))return false;if(!constructionResult0_9(v["revenueCents"]))return false;if(!constructionResult0_10(v["units"]))return false;if(!constructionResult0_11(v["events"]))return false;return true;}
function constructionResult0_5(v:Array<{"day":string;"region":string;"revenueCents":number;"units":number;"events":number}>):boolean {if(!Array.isArray(v))return false;for(let j=0;j<v.length;j++){if(!constructionResult0_6(v[j]))return false;}return true;}
function constructionResult0_12(v:null):boolean {return v===null;}
function constructionResult0_0(v:{"from":string;"to":string;"events":number;"revenueCents":number;"daily":Array<{"day":string;"region":string;"revenueCents":number;"units":number;"events":number}>;"timings":null}):boolean {if(v===null||typeof v!=="object")return false;if(!constructionResult0_1(v["from"]))return false;if(!constructionResult0_2(v["to"]))return false;if(!constructionResult0_3(v["events"]))return false;if(!constructionResult0_4(v["revenueCents"]))return false;if(!constructionResult0_5(v["daily"]))return false;if(!constructionResult0_12(v["timings"]))return false;return true;}
function constructionResult0(v:{"from":string;"to":string;"events":number;"revenueCents":number;"daily":Array<{"day":string;"region":string;"revenueCents":number;"units":number;"events":number}>;"timings":null}):boolean{return constructionResult0_0(v); }
export function run0(p0:string,p1:string,p2:string):string {try{const a0=p0;const a1=p1;const a2=p2;const value=f0(a0,a1,a2);const output=(constructionResult0(value)?JSON.stringify(value):'');return output;}catch(e){return '';}}
