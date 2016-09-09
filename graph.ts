export default class Graph {
  private nodes: Node[];
  private packages: NodeSubset<Package>;

  constructor() {
    let nodes: Node[] = [];
    let packages = new NodeSubset(nodes, (id: number, packageId: string) => {
      let p;
      let modules = new NodeSubset<Module>(nodes, (id: number, moduleId: string) => {
        let m;
        let createNamed = (id: number, name: string) => {
          return new Named(id, m, name);
        };
        let imports = new NodeSubset<Named>(nodes, createNamed);
        let exports = new NodeSubset<Named>(nodes, createNamed);
        m = new Module(id, p, moduleId, imports, exports);
        return m;
      });
      p = new Package(id, packageId, modules);
      return p;
    });
    this.nodes = nodes;
    this.packages = packages;
  }

  getPackage(packageId: string): Package {
    return this.packages.add(packageId);
  }

  addModule(moduleId: string): Module {
    return this.packages.add(getPackageId(moduleId)).modules.add(moduleId);
  }

  toDot(): string {
    let writer = new Writer();
    writer.writeLine("digraph G {");
    writer.writeLine("ratio = \"auto\";");
    writer.indent(writer => {
      this.packages.toDot(writer);
      this.packages.writeEdges(writer);
    });
    writer.writeLine("}");
    return writer.toString();
    // console.log("digraph G {");
    // this.packages.forEach(p => {
    //   if (!p.isHidden()) {
    //     console.log(`  subgraph ${p.nodeId()} {`);
    //     console.log(`    label=${p.label()};`);
    //   }
    //   p.modules.forEach(m => {
    //     if (m.isClustered()) {
    //       console.log(`    subgraph ${m.nodeId()} {`);
    //       console.log("      node [style=filled,color=white];");
    //       console.log("      style=filled;");
    //       console.log("      color=lightgrey;");
    //       console.log(`      label=${m.label()};`);
    //       m.exports.forEach(node => {
    //         console.log(`${node.nodeId()} [label=${node.label()}];`);
    //       });
    //       m.imports.forEach(node => {
    //         console.log(`${node.nodeId()} [label=${node.label()}];`);
    //       });
    //       console.log("    }");
    //     } else {
    //       console.log(`${m.nodeId()} [label=${m.label()}];`);
    //     }
    //     // draw incoming edges to module
    //   });
    //   if (!p.isHidden()) {
    //     console.log("  }");
    //   }
    // });

    // console.log("}");
  }
}

class Writer {
  private buffer = "";
  private _indent = "";

  indent(cb: (writer: this) => void) {
    let old = this._indent;
    this._indent = old + "  ";
    cb(this);
    this._indent = old;
  }

  writeLine(line: string) {
    this.buffer += this._indent + line + "\n";
  }

  toString() {
    return this.buffer;
  }
}

/**
 *           // exports have to follow subgraph
          // otherwise nodes in other modules that haven't be graphed
          // will mistakenly be added to this module
          exports.forEach(e => {
            e.incoming.forEach(fromNode => {
              console.log(`n${fromNode.id} -> n${e.id};`);
            });
          });
 */
// DRAW EDGES AT END

export class NodeSubset<T extends Node> {
  private map: { [key: string]: number | undefined } = Object.create(null);

  [index: number]: T;

  public length = 0;

  constructor(private nodes: Node[], private create: (id: number, key: string) => T) {
  }

  public add(key: string) {
    let index = this.map[key];
    if (index === undefined) {
      let node = this.create(this.nodes.length, key);
      this.nodes.push(node);
      index = this.length++;
      this[index] = node;
      this.map[key] = index;
    }
    return this[index];
  }

  public forEach(cb: (node: T, i: number) => void) {
    for (let i = 0; i < this.length; i++) {
      cb(this[i], i);
    }
  }

  public toDot(writer: Writer) {
    this.forEach(node => node.toDot(writer));
  }

  public writeEdges(writer: Writer) {
    this.forEach(node => node.writeEdges(writer));
  }
}

export class Node {
  public outgoing = 0;
  public incoming: Node[] = [];

  constructor(public id: number, public key: string, public parent: Node | null) {
  }

  public addIncoming(node: Node) {
    let { incoming } = this;
    if (incoming.indexOf(node) === -1) {
      incoming.push(node);
      node.outgoing++;
    }
  }

  public label(): string {
    return JSON.stringify(this.key);
  }

  public isClustered(): boolean {
    return false;
  }

  public nodeId(): string {
    return "n" + this.id;
  }

  public toDot(writer: Writer) {
    writer.writeLine(`${this.nodeId()} [label = ${this.label()}];`);
  }

  public writeEdges(writer: Writer) {
    this.incoming.forEach(fromNode => {
      writer.writeLine(`${fromNode.nodeId()} -> ${this.nodeId()};`);
    });
  }
}

export class Package extends Node {
  constructor(id: number, public packageId: string, public modules: NodeSubset<Module>) {
    super(id, packageId, null);
  }

  public isHidden(): boolean {
    return this.modules.length === 1 && this.modules[0].key === this.key;
  }

  public isClustered(): boolean {
    return false;
  }

  public toDot(writer: Writer) {
    if (!this.isHidden()) {
      writer.writeLine(`${this.nodeId()} [shape=none,label=""]`);
    }
    this.modules.toDot(writer);
  }

  public writeEdges(writer: Writer) {
    if (!this.isHidden()) {
      this.modules.forEach(moduleNode => {
        writer.writeLine(`${this.nodeId()} -> ${moduleNode.nodeId()} [style=invis];`);
      });
    }
    this.modules.writeEdges(writer);
  }
}

export class Named extends Node {
  constructor(id: number, public parent: Node, public name: string) {
    super(id, name, parent);
  }

  nodeId() {
    return this.parent.nodeId() + ":" + super.nodeId();
  }

  label() {
    return JSON.stringify(this.name);
  }
}

export class Module extends Node {
  constructor(id: number, public parent: Node, public moduleId: string, public imports: NodeSubset<Named>, public exports: NodeSubset<Named>) {
    super(id, moduleId, parent);
  }

  public toDot(writer: Writer) {
    let { imports, exports } = this;
    if (imports.length > 0 || exports.length > 0) {
      let label = "\"{";
      if (imports.length) {
        label += "{";
        imports.forEach((node, i) => {
          if (i !== 0) {
            label += "|";
          }
          label += `<n${node.id}> ${node.name}`;
        });
        label += "}";
        label += "|";
      }
      label += this.moduleId;
      if (exports.length) {
        label += "|";
        label += "{";
        exports.forEach((node, i) => {
          if (i !== 0) {
            label += "|";
          }
          label += `<n${node.id}> ${node.name}`;
        });
        label += "}";
      }
      label += "}\"";
      writer.writeLine(`${this.nodeId()} [shape=record;label=${label}]`);
    } else {
      super.toDot(writer);
    }
  }

  public writeEdges(writer: Writer) {
    super.writeEdges(writer);
    if (this.moduleId === "ember-metal/index") {
      debugger;
    }
    this.imports.writeEdges(writer);
    this.exports.writeEdges(writer);
  }
}

function getPackageId(moduleId: string): string {
  let i = moduleId.indexOf("/");
  if (i === -1) return moduleId;
  return moduleId.substring(0, i);
}
