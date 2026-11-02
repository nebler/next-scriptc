// Private JSON helpers demonstrate call-site specialization.
function generic<T>(xs:T[]){return xs.map(x=>({value:x}));}
function broad(xs:object[]){return xs.map(x=>({value:x}));}
function loose(xs:any){return xs.map((x:{n:number})=>({value:x.n}));}
function scalarValue(x:any){for(let i=0;i<1;i++){}return x;}
function scalar(xs:any){return xs.map((x:{n:number})=>x.n).length;}
export function caller(){scalarValue(1);scalar([{n:1}]);return [generic([{n:1}]),generic([{n:2}]),broad([{n:1}]),loose([{n:1}])];}
