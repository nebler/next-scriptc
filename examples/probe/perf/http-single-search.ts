import {serve} from "./shim/serve.ts";
import {GET as search} from "../../demo/app/api/search/route.ts";
serve({GET:search,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:'/api/search'});
