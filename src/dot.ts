import Writer from "./writer";
import { Graph, Node, NodeType, ImportName, ExportName } from "./graph";

const d3 = require("d3-scale");
const schemeCategory10: string[] = d3.schemeCategory10;
function nodeColor(id: number) {
  return schemeCategory10[id % 10];
}

export default class DotFormatter {
  constructor(private graph: Graph) {
  }

  public write(out: Writer): void {
    out.line("digraph G {");
    out.indent(out => {
      out.lines(`ratio="auto";
                 splines=true;
                 overlap=false;
                 node [fontname="Arial"]
                 rankdir=LR;`);
      this.writeModules(out);
      this.writeEdges(out);
    });
    out.line("}");
  }

  protected writeModules(out: Writer) {
    this.graph.modules.forEach(moduleNode => {
      let label = `<<TABLE COLOR="${nodeColor(moduleNode.id)}" BORDER="0" CELLBORDER="1" CELLSPACING="0">`;
      label += `<TR><TD><B>${moduleNode.moduleId}</B></TD></TR>`;
      if (moduleNode.namedImports) {
        label += `<TR><TD BGCOLOR="#999999"><FONT COLOR="#FFFFFF">imports</FONT></TD></TR>`;
        moduleNode.namedImports.forEach(node => {
          label += `<TR><TD PORT="${nodeId(node)}">${node.name}</TD></TR>`;
        });
      }
      if (moduleNode.exports) {
        label += `<TR><TD BGCOLOR="#999999"><FONT COLOR="#FFFFFF">exports</FONT></TD></TR>`;
        moduleNode.exports.forEach(node => {
          label += `<TR><TD PORT="${nodeId(node)}">${node.name}</TD></TR>`;
        });
      }
      label += `</TABLE>>`;
      out.line(`${nodeId(moduleNode)} [shape=none;label=${label}];`);
    });
  }

  protected writeEdges(out: Writer) {
    this.graph.modules.forEach(moduleNode => {
      let { moduleImports, requires, namedImports, exports } = moduleNode;
      if (moduleImports) {
        moduleImports.forEach(fromModule => {
          this.writeEdge(out, fromModule, moduleNode);
        });
      }
      if (requires) {
        requires.forEach(node => {
          this.writeEdge(out, node, moduleNode, "dashed");
        });
      }
      if (namedImports) {
        namedImports.forEach(node => {
          this.writeEdge(out, node.from, node);
        });
      }
      if (exports) {
        exports.forEach(node => {
          if (node.from) {
            this.writeEdge(out, node.from, node);
          }
        });
      }
    });
  }

  protected writeEdge(out: Writer, fromNode: Node, toNode: Node, style?: string) {
    let color: string;
    if (isNamed(fromNode)) {
      color = nodeColor(fromNode.parent.id);
    } else {
      color = nodeColor(fromNode.id);
    }
    let fromCompass = isNamed(fromNode) ? "e" : "s";
    let toCompass = isNamed(toNode) ? "w" : "n";
    let suffix = "";
    if (style) {
      suffix += `;style="${style}"`;
    }
    out.line(`${nodeId(fromNode, true)}:${fromCompass} -> ${nodeId(toNode, true)}:${toCompass} [color="${color}"${suffix}];`);
  }
}

function nodeId(node: Node, qualify?: boolean): string {
  if (qualify && isNamed(node)) {
    return `n${node.parent.id}:n${node.id}`;
  }
  return `n${node.id}`;
}

function isNamed(node: Node): node is (ImportName | ExportName) {
  return node.nodeType === NodeType.ImportName ||
         node.nodeType === NodeType.ExportName;
}
