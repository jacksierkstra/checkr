import { XSDIdentityConstraint, XSDElement } from "@lib/types/xsd.js";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline.js";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseIdentityConstraintsStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    const constraints: XSDIdentityConstraint[] = [];

    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType !== 1) return;
      const child = node as Element;
      if (child.namespaceURI !== XSD_NAMESPACE) return;

      const kind = child.localName;
      if (kind !== "key" && kind !== "unique" && kind !== "keyref") return;

      const name = child.getAttribute("name");
      const selector = child.getElementsByTagNameNS(XSD_NAMESPACE, "selector")[0];
      const fieldNodes = child.getElementsByTagNameNS(XSD_NAMESPACE, "field");
      if (!name || !selector || fieldNodes.length === 0) return;

      const fields = Array.from(fieldNodes)
        .map((field) => field.getAttribute("xpath") || "")
        .filter(Boolean);
      const selectorPath = selector.getAttribute("xpath") || "";
      if (!selectorPath || fields.length === 0) return;

      const constraint: XSDIdentityConstraint = {
        kind,
        name,
        selector: selectorPath,
        fields,
      };

      if (kind === "keyref") {
        const refer = child.getAttribute("refer");
        if (refer) constraint.refer = refer.replace(/^.*:/, "");
      }

      constraints.push(constraint);
    });

    return constraints.length > 0 ? { identityConstraints: constraints } : {};
  }
}
