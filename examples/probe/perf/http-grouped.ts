import {serveMany} from "./shim/grouped.ts";
import {GET as hello} from "../../demo/app/api/hello/route.ts";
import {GET as search} from "../../demo/app/api/search/route.ts";
import {GET as markdown} from "../../demo/app/api/posts/[slug]/route.ts";
import {GET as verify} from "../../demo/app/api/verify/route.ts";
import {POST as scrypt} from "../../demo/app/api/login-scrypt/route.ts";
import {GET as primes} from "../../demo/app/api/primes/route.ts";
serveMany([{module:{GET:hello,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},pattern:'/api/hello'},{module:{GET:search,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},pattern:'/api/search'},{module:{GET:markdown,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},pattern:'/api/posts/[slug]'},{module:{GET:verify,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},pattern:'/api/verify'},{module:{GET:undefined,HEAD:undefined,POST:scrypt,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},pattern:'/api/login-scrypt'},{module:{GET:primes,HEAD:undefined,POST:undefined,PUT:undefined,PATCH:undefined,DELETE:undefined,OPTIONS:undefined},pattern:'/api/primes'}]);
