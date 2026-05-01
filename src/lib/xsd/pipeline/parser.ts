import { XSDElement, XSDAttribute, XSDSchema } from "@lib/types/xsd";
import { XMLParser } from "@lib/xml/parser";
import { ElementAssembler } from "@lib/xsd/pipeline/elementAssembler";
import { Pipeline, PipelineImpl } from "@lib/xsd/pipeline/pipeline";
import { ParseAttributesStep } from "@lib/xsd/pipeline/steps/attributes";
import { ParseEnumerationStep } from "@lib/xsd/pipeline/steps/enumeration";
import { ParseExtensionStep } from "@lib/xsd/pipeline/steps/extension";
import { ParseNestedElementsStep } from "@lib/xsd/pipeline/steps/nestedElement";
import { ParseIdentityConstraintsStep } from "@lib/xsd/pipeline/steps/identityConstraints";
import { ParseRestrictionsStep } from "@lib/xsd/pipeline/steps/restriction";
import { ParseRootElementStep } from "@lib/xsd/pipeline/steps/rootElement";
import { ParseSimpleContentStep } from "@lib/xsd/pipeline/steps/simpleContent";
import { ParseListStep } from "@lib/xsd/pipeline/steps/list";
import { ParseUnionStep } from "@lib/xsd/pipeline/steps/union";
import { ModularTypeReferenceResolver } from "@lib/xsd/resolvers/ModularTypeReferenceResolver";
import { SubstitutionGroupResolver } from "@lib/xsd/resolvers/SubstitutionGroupResolver";
import { DocumentExtractor } from "@lib/xsd/utils/documentExtractor";
export interface XSDParser {
  parse(xsd: string): XSDSchema;
}

export class XSDPipelineParserImpl implements XSDParser {
  private pipeline: Pipeline<Element, Partial<XSDElement>>;
  private assembler: ElementAssembler;

  constructor(private xmlParser: XMLParser) {
    this.pipeline = new PipelineImpl<Element, Partial<XSDElement>>()
      .addStep(new ParseRootElementStep())
      .addStep(new ParseIdentityConstraintsStep())
      .addStep(new ParseEnumerationStep())
      .addStep(new ParseAttributesStep())
      .addStep(new ParseNestedElementsStep())
      .addStep(new ParseRestrictionsStep())
      .addStep(new ParseExtensionStep())
      .addStep(new ParseSimpleContentStep())
      .addStep(new ParseListStep())
      .addStep(new ParseUnionStep());
    this.assembler = new ElementAssembler();
  }

  parse(xsd: string): XSDSchema {
    const extractor = new DocumentExtractor(this.xmlParser);
    const doc = extractor.parseDocument(xsd);

    if (!doc.documentElement) {
      throw new Error("Invalid XML: No document element found.");
    }

    const schemaNodes = extractor.extractTopLevelSchemaNodes(doc.documentElement);

    // Separate global elements and global complexTypes.
    const elementNodes = schemaNodes.filter((node) => node.localName === "element");
    const complexTypeNodes = schemaNodes.filter((node) => node.localName === "complexType");
    const simpleTypeNodes = schemaNodes.filter((node) => node.localName === "simpleType");
    const groupNodes = schemaNodes.filter((node) => node.localName === "group");
    const attributeGroupNodes = schemaNodes.filter((node) => node.localName === "attributeGroup");
    const globalAttributeNodes = schemaNodes.filter((node) => node.localName === "attribute");

    // Process global elements via your pipeline.
    const elementPartials = elementNodes.map((el) => this.pipeline.execute(el));
    const elementsMerged = this.assembler.mergePartialElements(elementPartials);
    const validElements = this.assembler.filterValidElements(elementsMerged);

    // Process global complexTypes using the same pipeline (or a similar one)
    // so that we capture the definitions. Assume they share similar structure.
    const typePartials = complexTypeNodes.map((el) => this.pipeline.execute(el));
    const typesMerged = this.assembler.mergePartialElements(typePartials);
    // Create a map keyed by name (if available)
    const typesMap: { [key: string]: XSDElement } = {};
    typesMerged
      .filter((t): t is XSDElement => t.name !== undefined)
      .forEach((typeDef) => {
        typesMap[typeDef.name] = typeDef;
      });

    // Process global simpleTypes — pipeline resolves their restriction/facets.
    const simpleTypePartials = simpleTypeNodes.map((el) => this.pipeline.execute(el));
    const simpleTypesMerged = this.assembler.mergePartialElements(simpleTypePartials);
    simpleTypesMerged
      .filter((t): t is XSDElement => t.name !== undefined)
      .forEach((typeDef) => {
        typesMap[typeDef.name] = typeDef;
      });

    const groupPartials = groupNodes.map((el) => this.pipeline.execute(el));
    const groupsMerged = this.assembler.mergePartialElements(groupPartials);
    const groupsMap: { [key: string]: XSDElement[] } = {};
    groupsMerged
      .filter((group): group is XSDElement => group.name !== undefined)
      .forEach((groupDef) => {
        groupsMap[groupDef.name] = [
          ...(groupDef.children || []),
          ...(groupDef.choices?.flatMap((choice) => choice.elements) || []),
        ];
      });

    const attributeGroupPartials = attributeGroupNodes.map((el) => this.pipeline.execute(el));
    const attributeGroupsMerged = this.assembler.mergePartialElements(attributeGroupPartials);
    const attributeGroupsMap: { [key: string]: XSDAttribute[] } = {};
    attributeGroupsMerged
      .filter((group): group is XSDElement => group.name !== undefined)
      .forEach((groupDef) => {
        attributeGroupsMap[groupDef.name] = groupDef.attributes || [];
      });

    const attrParser = new ParseAttributesStep();
    const globalAttributesMap: { [name: string]: XSDAttribute } = {};
    for (const attrNode of globalAttributeNodes) {
      const parsed = attrParser.parseAttribute(attrNode);
      if (parsed && parsed.name) {
        globalAttributesMap[parsed.name] = parsed;
      }
    }

    const targetNamespace = doc.documentElement.getAttribute("targetNamespace") || undefined;
    const elementFormDefault =
      (doc.documentElement.getAttribute("elementFormDefault") as "qualified" | "unqualified") ||
      "unqualified";
    const attributeFormDefault =
      (doc.documentElement.getAttribute("attributeFormDefault") as "qualified" | "unqualified") ||
      "unqualified";
    const blockDefault = doc.documentElement.getAttribute("blockDefault") || undefined;
    const finalDefault = doc.documentElement.getAttribute("finalDefault") || undefined;
    const namespacedElements = targetNamespace
      ? this.assembler.applyNamespace(validElements, targetNamespace)
      : validElements;

    const schema: XSDSchema = {
      targetNamespace,
      elementFormDefault,
      attributeFormDefault,
      blockDefault,
      finalDefault,
      elements: namespacedElements,
      types: typesMap,
      groups: groupsMap,
      attributeGroups: attributeGroupsMap,
      globalAttributes: globalAttributesMap,
    };

    // Resolve type references now that we have global types available.
    const resolver = new ModularTypeReferenceResolver(schema);
    const resolvedElements = resolver.resolve();

    // Build substitution group map and enrich resolved elements
    const subGroupResolver = new SubstitutionGroupResolver();
    const subGroupMap = subGroupResolver.buildMap(validElements);
    const enrichedElements = subGroupResolver.enrichElements(resolvedElements, subGroupMap);

    const namespaceAppliedElements = this.applyNamespaces(enrichedElements, schema);
    const namespaceAppliedTypes = this.applyNamespacesOnMap(typesMap, schema);
    const namespaceAppliedGroups = this.applyNamespacesOnGroupMap(groupsMap, schema);
    const namespaceAppliedAttributeGroups = this.applyNamespacesOnAttributeGroupMap(
      attributeGroupsMap,
      schema,
    );

    return {
      ...schema,
      elements: namespaceAppliedElements,
      types: namespaceAppliedTypes,
      groups: namespaceAppliedGroups,
      attributeGroups: namespaceAppliedAttributeGroups,
    };
  }

  private applyNamespaces(elements: XSDElement[], schema: XSDSchema): XSDElement[] {
    return elements.map((element) => this.applyNamespaceToElement(element, schema, true));
  }

  private applyNamespacesOnMap(
    items: { [key: string]: XSDElement },
    schema: XSDSchema,
  ): { [key: string]: XSDElement } {
    return Object.fromEntries(
      Object.entries(items).map(([key, value]) => [key, this.applyNamespaceToElement(value, schema, true)]),
    );
  }

  private applyNamespacesOnGroupMap(
    items: { [key: string]: XSDElement[] },
    schema: XSDSchema,
  ): { [key: string]: XSDElement[] } {
    return Object.fromEntries(
      Object.entries(items).map(([key, value]) => [key, value.map((el) => this.applyNamespaceToElement(el, schema, false))]),
    );
  }

  private applyNamespacesOnAttributeGroupMap(
    items: { [key: string]: XSDAttribute[] },
    schema: XSDSchema,
  ): { [key: string]: XSDAttribute[] } {
    return Object.fromEntries(
      Object.entries(items).map(([key, value]) => [key, value.map((attr) => this.applyNamespaceToAttribute(attr, schema, false))]),
    );
  }

  private applyNamespaceToElement(
    element: XSDElement,
    schema: XSDSchema,
    isTopLevel: boolean,
  ): XSDElement {
    const resolved: XSDElement = { ...element };
    if (resolved.block === undefined && schema.blockDefault) {
      resolved.block = schema.blockDefault;
    }
    if (resolved.final === undefined && schema.finalDefault) {
      resolved.final = schema.finalDefault;
    }
    const effectiveForm = resolved.form ?? (isTopLevel ? "qualified" : schema.elementFormDefault ?? "unqualified");
    resolved.namespace = this.resolveNamespace(effectiveForm, schema.targetNamespace, isTopLevel);

    // Resolve namespace tokens for xs:any wildcard constraint
    if (resolved.anyNamespace) {
      resolved.anyNamespace = this.resolveNamespaceToken(resolved.anyNamespace, schema.targetNamespace);
    }
    if (resolved.anyAttributeNamespace) {
      resolved.anyAttributeNamespace = this.resolveNamespaceToken(resolved.anyAttributeNamespace, schema.targetNamespace);
    }

    if (resolved.attributes) {
      resolved.attributes = resolved.attributes.map((attr) => this.applyNamespaceToAttribute(attr, schema, false));
    }

    if (resolved.children) {
      resolved.children = resolved.children.map((child) => this.applyNamespaceToElement(child, schema, false));
    }

    if (resolved.choices) {
      resolved.choices = resolved.choices.map((choice) => ({
        ...choice,
        elements: choice.elements.map((child) => this.applyNamespaceToElement(child, schema, false)),
      }));
    }

    if (resolved.extension) {
      resolved.extension = {
        ...resolved.extension,
        attributes: resolved.extension.attributes?.map((attr) =>
          this.applyNamespaceToAttribute(attr, schema, false),
        ),
        children: resolved.extension.children?.map((child) =>
          this.applyNamespaceToElement(child, schema, false),
        ),
        choices: resolved.extension.choices?.map((choice) => ({
          ...choice,
          elements: choice.elements.map((child) => this.applyNamespaceToElement(child, schema, false)),
        })),
      };
    }

    if (resolved.restriction) {
      resolved.restriction = {
        ...resolved.restriction,
        attributes: resolved.restriction.attributes?.map((attr) =>
          this.applyNamespaceToAttribute(attr, schema, false),
        ),
        children: resolved.restriction.children?.map((child) =>
          this.applyNamespaceToElement(child, schema, false),
        ),
        choices: resolved.restriction.choices?.map((choice) => ({
          ...choice,
          elements: choice.elements.map((child) => this.applyNamespaceToElement(child, schema, false)),
        })),
      };
    }

    return resolved;
  }

  private applyNamespaceToAttribute(
    attr: XSDAttribute,
    schema: XSDSchema,
    isTopLevel: boolean,
  ): XSDAttribute {
    const resolved = { ...attr };
    const effectiveForm =
      resolved.form ?? (isTopLevel ? "qualified" : schema.attributeFormDefault ?? "unqualified");
    resolved.namespace = this.resolveNamespace(effectiveForm, schema.targetNamespace, isTopLevel);
    return resolved;
  }

  private resolveNamespaceToken(token: string, targetNs: string | undefined): string {
    if (token === "##targetNamespace") return targetNs ?? "";
    if (token === "##other") return `##other:${targetNs ?? ""}`;
    return token; // "##local" or specific URI
  }

  private resolveNamespace(
    form: "qualified" | "unqualified",
    targetNamespace: string | undefined,
    isTopLevel: boolean,
  ): string | undefined {
    if (!targetNamespace) return undefined;
    if (isTopLevel) return targetNamespace;
    return form === "qualified" ? targetNamespace : undefined;
  }
}
