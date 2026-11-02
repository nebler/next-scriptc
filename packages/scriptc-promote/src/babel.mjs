import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generator from '@babel/generator';
import * as types from '@babel/types';
export const babelModules={parser:()=>parser,traverse:()=>traverse,generator:()=>generator,types:()=>types};
