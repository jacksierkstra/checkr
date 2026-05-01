import { XSDElement, XSDChoice } from "@lib/types/xsd";
import { PipelineStep } from "@lib/xsd/pipeline/pipeline";

const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

export class ParseNestedElementsStep implements PipelineStep<Element, Partial<XSDElement>> {
  execute(el: Element): Partial<XSDElement> {
    let result = {
      children: [] as XSDElement[],
      choices: [] as XSDChoice[],
      allowAnyChild: false,
      anyProcessContents: undefined as "strict" | "lax" | "skip" | undefined,
      anyNamespace: undefined as string | undefined,
    };

    if (this.isXsdElement(el, "group") && !el.getAttribute("ref")) {
      const res = this.parseContainer(el, false, false);
      result.children.push(...res.children);
      if (res.choices.length > 0) {
        result.choices.push(...res.choices);
      }
      if (res.allowAnyChild) { result.allowAnyChild = true; result.anyProcessContents = res.anyProcessContents; result.anyNamespace = res.anyNamespace; }
    } else if (this.isXsdElement(el, "complexType")) {
      const res = this.parseContainer(el, false);
      result.children.push(...res.children);
      if (res.choices.length > 0) {
        result.choices.push(...res.choices);
      }
      if (res.allowAnyChild) { result.allowAnyChild = true; result.anyProcessContents = res.anyProcessContents; result.anyNamespace = res.anyNamespace; }
    } else {
      const complexTypes = Array.from(el.childNodes)
        .filter((node) => {
          const element = node as Element;
          return element.nodeType === 1 && this.isXsdElement(element, "complexType");
        })
        .map((node) => node as Element);

      complexTypes.forEach((ct) => {
        const res = this.parseContainer(ct, false);
        result.children.push(...res.children);
        if (res.choices.length > 0) {
          result.choices.push(...res.choices);
        }
        if (res.allowAnyChild) { result.allowAnyChild = true; result.anyProcessContents = res.anyProcessContents; result.anyNamespace = res.anyNamespace; }
      });
    }

    return result.allowAnyChild
      ? { children: result.children, choices: result.choices, allowAnyChild: true, anyProcessContents: result.anyProcessContents, anyNamespace: result.anyNamespace }
      : { children: result.children, choices: result.choices };
  }

  private parseContainer(
    el: Element,
    isInChoice: boolean = false,
    isInAll: boolean = false,
  ): { children: XSDElement[]; choices: XSDChoice[]; allowAnyChild: boolean; anyProcessContents?: "strict" | "lax" | "skip"; anyNamespace?: string } {
    let children: XSDElement[] = [];
    let choices: XSDChoice[] = [];
    let allowAnyChild = false;
    let anyProcessContents: "strict" | "lax" | "skip" | undefined;
    let anyNamespace: string | undefined;

    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType !== 1) return;
      const child = node as Element;

      if (this.isXsdElement(child, "element")) {
        const element = this.parseElement(child, isInChoice, isInAll);
        if (element) {
          children.push(element);
        }
      } else if (this.isXsdElement(child, "sequence")) {
        const seqMinOccurs = this.parseOccurrence(child.getAttribute("minOccurs"), 1);
        const seqMaxOccurs = this.parseMaxOccurrence(child.getAttribute("maxOccurs"), 1);
        const hasGroupOccurrence = seqMinOccurs !== 1 || seqMaxOccurs !== 1;

        const res = this.parseContainer(child, false, isInAll);
        if (hasGroupOccurrence && res.children.length > 0) {
          // Represent as a sequence group with its own occurrence constraints
          choices.push({
            elements: res.children,
            minOccurs: seqMinOccurs,
            maxOccurs: seqMaxOccurs,
            isSequence: true,
          });
        } else {
          children.push(...res.children);
          choices.push(...res.choices);
        }
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (this.isXsdElement(child, "choice")) {
        const choiceMinOccurs = this.parseOccurrence(child.getAttribute("minOccurs"), 1);
        const choiceMaxOccurs = this.parseMaxOccurrence(child.getAttribute("maxOccurs"), 1);

        const res = this.parseContainer(child, true, isInAll);
        if (res.children.length > 0) {
          const entry: XSDChoice = { elements: res.children };
          if (choiceMinOccurs !== 1) entry.minOccurs = choiceMinOccurs;
          if (choiceMaxOccurs !== 1) entry.maxOccurs = choiceMaxOccurs;
          choices.push(entry);
        }
        choices.push(...res.choices);
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (this.isXsdElement(child, "all")) {
        const res = this.parseContainer(child, false, true);
        // Tag all children as order-independent
        children.push(...res.children.map((c) => ({ ...c, inAll: true })));
        choices.push(...res.choices);
        if (res.allowAnyChild) allowAnyChild = true;
      } else if (this.isXsdElement(child, "group")) {
        const ref = child.getAttribute("ref");
        if (!ref) return;
        const localRef = ref.replace(/^.*:/, "");
        const minOccursAttr = child.getAttribute("minOccurs");
        const minOccurs = parseInt(
          minOccursAttr && minOccursAttr.trim() !== "" ? minOccursAttr : "1",
          10,
        );
        const maxOccursAttr = child.getAttribute("maxOccurs");
        const maxOccurs =
          maxOccursAttr === "unbounded"
            ? ("unbounded" as const)
            : parseInt(maxOccursAttr && maxOccursAttr.trim() !== "" ? maxOccursAttr : "1", 10);
        const effectiveMaxOccurs = isInAll && maxOccurs !== "unbounded" ? Math.min(maxOccurs, 1) : maxOccurs;
        children.push({ name: localRef, groupRef: localRef, minOccurs, maxOccurs: effectiveMaxOccurs });
      } else if (this.isXsdElement(child, "any")) {
        allowAnyChild = true;
        const pc = child.getAttribute("processContents");
        if (pc === "strict" || pc === "lax" || pc === "skip") {
          anyProcessContents = pc;
        }
        const ns = child.getAttribute("namespace");
        if (ns && ns !== "##any") {
          anyNamespace = ns;
        }
      }
    });

    return { children, choices, allowAnyChild, anyProcessContents, anyNamespace };
  }

  private parseOccurrence(attr: string | null, defaultVal: number): number {
    if (!attr || attr.trim() === "") return defaultVal;
    const parsed = parseInt(attr, 10);
    return isNaN(parsed) ? defaultVal : parsed;
  }

  private parseMaxOccurrence(attr: string | null, defaultVal: number | "unbounded"): number | "unbounded" {
    if (!attr || attr.trim() === "") return defaultVal;
    if (attr === "unbounded") return "unbounded";
    const parsed = parseInt(attr, 10);
    return isNaN(parsed) ? defaultVal : parsed;
  }

  private parseElement(el: Element, isInChoice: boolean = false, isInAll: boolean = false): XSDElement | null {
    const name = el.getAttribute("name");
    const ref = el.getAttribute("ref");

    // Use ref local name as element name when ref is present but name is absent
    const effectiveName = name ?? (ref ? ref.replace(/^.*:/, "") : null);
    if (!effectiveName) return null;

    const minOccursAttr = el.getAttribute("minOccurs");
    const minOccurs = parseInt(
      minOccursAttr && minOccursAttr.trim() !== "" ? minOccursAttr : "1",
      10,
    );
    const effectiveMinOccurs =
      isInChoice && (!minOccursAttr || minOccursAttr.trim() === "") ? 0 : minOccurs;

    const maxOccursAttr = el.getAttribute("maxOccurs");
    let maxOccurs: number | "unbounded" =
      maxOccursAttr === "unbounded"
        ? "unbounded"
        : parseInt(maxOccursAttr && maxOccursAttr.trim() !== "" ? maxOccursAttr : "1", 10);
    if (isInAll) {
      maxOccurs = maxOccurs === "unbounded" ? 1 : Math.min(maxOccurs, 1);
    }

    const xsdElement: XSDElement = { name: effectiveName, minOccurs: effectiveMinOccurs, maxOccurs };

    if (ref && !name) {
      // Mark as a ref placeholder; resolver will replace with global definition
      xsdElement.ref = ref.replace(/^.*:/, "");
      return xsdElement;
    }

    const typeAttr = el.getAttribute("type");
    if (typeAttr) {
      xsdElement.type = typeAttr;
    }

    const form = el.getAttribute("form");
    if (form === "qualified" || form === "unqualified") {
      xsdElement.form = form;
    }

    const block = el.getAttribute("block");
    if (block !== null) {
      xsdElement.block = block;
    }

    const final = el.getAttribute("final");
    if (final !== null) {
      xsdElement.final = final;
    }

    const abstract = el.getAttribute("abstract");
    if (abstract === "true") {
      xsdElement.abstract = true;
    }

    const nillable = el.getAttribute("nillable");
    if (nillable === "true") {
      xsdElement.nillable = true;
    }

    const defaultAttr = el.getAttribute("default");
    if (defaultAttr !== null) xsdElement.default = defaultAttr;

    const fixedAttr = el.getAttribute("fixed");
    if (fixedAttr !== null) xsdElement.fixed = fixedAttr;

    const inlineComplexType = Array.from(el.childNodes)
      .filter((n) => this.isXsdElement(n as Element, "complexType"))
      .map((n) => n as Element)[0];
    if (inlineComplexType) {
      const res = this.parseContainer(inlineComplexType, false);
      if (res.children.length > 0) xsdElement.children = res.children;
      if (res.choices.length > 0) xsdElement.choices = res.choices;
      if (res.allowAnyChild) {
        xsdElement.allowAnyChild = true;
        if (res.anyProcessContents) xsdElement.anyProcessContents = res.anyProcessContents;
        if (res.anyNamespace) xsdElement.anyNamespace = res.anyNamespace;
      }
    }
    return xsdElement;
  }

  private isXsdElement(el: Element, name: string): boolean {
    return el.localName === name && el.namespaceURI === XSD_NAMESPACE;
  }
}
