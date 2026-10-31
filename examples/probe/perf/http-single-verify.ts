import {serve} from "./shim/serve.ts";
import {GET as verify} from "../../demo/app/api/verify/route.ts";
serve({GET:verify,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:'/api/verify'});
