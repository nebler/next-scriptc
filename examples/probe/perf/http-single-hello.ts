import {serve} from "./shim/serve.ts";
import {GET as hello} from "../../demo/app/api/hello/route.ts";
serve({GET:hello,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:'/api/hello'});
