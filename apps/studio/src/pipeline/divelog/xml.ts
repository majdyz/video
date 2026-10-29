// Minimal XML reader for dive-log exports (UDDF, Shearwater XML): elements,
// attributes, text, CDATA, comments, processing instructions and the five
// predefined entities plus numeric character references. No namespaces
// (prefixes are kept in the name and `local()` strips them), no DTD
// expansion. Runs the same in node and the browser.

export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.indexOf("&") < 0
    ? s
    : s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
        e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m,
      );

export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = src.length;
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt < 0) {
      top.text += decode(src.slice(i));
      break;
    }
    if (lt > i) top.text += decode(src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const e = src.indexOf("]]>", lt + 9);
      top.text += src.slice(lt + 9, e < 0 ? n : e);
      i = e < 0 ? n : e + 3;
    } else if (src[lt + 1] === "?" || src[lt + 1] === "!") {
      const e = src.indexOf(">", lt);
      i = e < 0 ? n : e + 1;
    } else if (src[lt + 1] === "/") {
      const e = src.indexOf(">", lt);
      const name = src.slice(lt + 2, e).trim();
      // Close up to the matching element (tolerates unclosed children).
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = e < 0 ? n : e + 1;
    } else {
      let e = lt + 1;
      let quote = "";
      for (; e < n; e++) {
        const c = src[e];
        if (quote) {
          if (c === quote) quote = "";
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
      }
      let body = src.slice(lt + 1, e);
      const selfClose = body.endsWith("/");
      if (selfClose) body = body.slice(0, -1);
      const m = body.match(/^\s*([^\s/>]+)/);
      const node: XmlNode = { name: m ? m[1] : "", attrs: {}, children: [], text: "" };
      const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      const rest = body.slice(m ? m[0].length : 0);
      while ((a = re.exec(rest))) node.attrs[a[1]] = decode(a[3] ?? a[4] ?? "");
      top.children.push(node);
      if (!selfClose) stack.push(node);
      i = e + 1;
    }
  }
  return root;
}

/** Element name without a namespace prefix, lower-cased. */
export const local = (name: string) => name.slice(name.indexOf(":") + 1).toLowerCase();

/** Direct children named `name` (prefix and case ignored). */
export function kids(node: XmlNode, name: string): XmlNode[] {
  const want = name.toLowerCase();
  return node.children.filter((c) => local(c.name) === want);
}

export function kid(node: XmlNode, name: string): XmlNode | undefined {
  const want = name.toLowerCase();
  return node.children.find((c) => local(c.name) === want);
}

/** All descendants named `name`, document order. */
export function findAll(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  const want = name.toLowerCase();
  for (const c of node.children) {
    if (local(c.name) === want) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

export function textOf(node: XmlNode | undefined): string {
  if (!node) return "";
  return (node.text + node.children.map(textOf).join("")).trim();
}

/** Number from a child element's text, or undefined. */
export function numOf(node: XmlNode | undefined, child?: string): number | undefined {
  const t = textOf(child && node ? kid(node, child) : node).replace(",", ".");
  if (!t) return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}
