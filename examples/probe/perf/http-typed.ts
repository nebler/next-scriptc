import {serve} from "./shim/typed.ts";
import {GET} from "../../demo/app/api/hello/route.ts";
serve({GET,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:"/api/hello"});
