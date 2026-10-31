import {serve} from "./shim/serve.ts";
import {POST as scrypt} from "../../demo/app/api/login-scrypt/route.ts";
serve({GET:undefined,HEAD:undefined,POST:scrypt,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:'/api/login-scrypt'});
