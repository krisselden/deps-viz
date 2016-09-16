import * as ts from "typescript";
import Compiler from "./compiler";
import Writer from "./writer";
import Formatter from "./dot";

let modulesRoot = ts.sys.resolvePath("../../emberjs/ember.js/dist/es");
let rootNames = [modulesRoot + "/glimmer-syntax/index.js"];
let compiler = new Compiler(modulesRoot, rootNames);
let graph = compiler.compile();

let dotFormatter = new Formatter(graph);
let out = new Writer();
dotFormatter.write(out);
console.log(out.toString());
