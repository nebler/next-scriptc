import {serve} from "./shim/serve.ts";
import {GET} from "../../demo/app/api/hello/route.ts";
serve({GET,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:"/api/hello"});
