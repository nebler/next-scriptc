import {serve} from "./shim/serve.ts";
import {GET as markdown} from "../../demo/app/api/posts/[slug]/route.ts";
serve({GET:markdown,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},{pattern:'/api/posts/[slug]'});
