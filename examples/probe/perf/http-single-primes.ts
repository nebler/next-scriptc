import {serve} from "./shim/serve.ts";
import {GET as primes} from "../../demo/app/api/primes/route.ts";
serve({GET:primes,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:'/api/primes'});
