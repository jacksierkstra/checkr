import { XSDElement, XSDAttribute } from "@lib/types/xsd.js";
import { IGroupResolver } from "./interfaces.js";

export class GroupResolver implements IGroupResolver {
  constructor(private schema: { groups?: Record<string, XSDElement[]>; attributeGroups?: Record<string, XSDAttribute[]> }) {}

  resolveGroups(element: XSDElement): XSDElement {
    return this.resolveElement(element, new Set());
  }

  private resolveElement(element: XSDElement, stack: Set<string>): XSDElement {
    const resolved: XSDElement = { ...element };

    if (resolved.attributes) {
      resolved.attributes = this.resolveAttributes(resolved.attributes, stack);
    }

    if (resolved.children) {
      resolved.children = this.expandChildren(resolved.children, stack);
    }

    if (resolved.choices) {
      resolved.choices = resolved.choices.map((choice) => ({
        ...choice,
        elements: this.expandChildren(choice.elements, stack) ?? [],
      }));
    }

    if (resolved.extension) {
      resolved.extension = {
        ...resolved.extension,
        attributes: this.resolveAttributes(resolved.extension.attributes, stack),
        children: resolved.extension.children ? this.expandChildren(resolved.extension.children, stack) : undefined,
        choices: resolved.extension.choices?.map((choice) => ({
          ...choice,
          elements: this.expandChildren(choice.elements, stack) ?? [],
        })),
      };
    }

    if (resolved.restriction) {
      resolved.restriction = {
        ...resolved.restriction,
        attributes: this.resolveAttributes(resolved.restriction.attributes, stack),
        children: resolved.restriction.children ? this.expandChildren(resolved.restriction.children, stack) : undefined,
        choices: resolved.restriction.choices?.map((choice) => ({
          ...choice,
          elements: this.expandChildren(choice.elements, stack) ?? [],
        })),
      };
    }

    return resolved;
  }

  private expandChildren(children: XSDElement[] | undefined, stack: Set<string>): XSDElement[] | undefined {
    if (!children || children.length === 0) return children;

    return children.flatMap((child) => {
      if (child.groupRef) {
        const group = this.schema.groups?.[child.groupRef];
        if (!group || stack.has(child.groupRef)) {
          return [child];
        }

        stack.add(child.groupRef);
        const expanded = group.flatMap((groupChild) =>
          this.resolveElement(
            {
              ...groupChild,
              minOccurs: child.minOccurs ?? groupChild.minOccurs,
              maxOccurs: child.maxOccurs ?? groupChild.maxOccurs,
              inAll: child.inAll || groupChild.inAll,
            },
            stack,
          ),
        );
        stack.delete(child.groupRef);
        return expanded;
      }

      return [this.resolveElement(child, stack)];
    });
  }

  private resolveAttributes(attributes: XSDAttribute[] | undefined, stack: Set<string>): XSDAttribute[] | undefined {
    if (!attributes || attributes.length === 0) return attributes;

    return attributes.flatMap((attr) => {
      if (!attr.attributeGroupRef) {
        return [attr];
      }

      const group = this.schema.attributeGroups?.[attr.attributeGroupRef];
      if (!group || stack.has(attr.attributeGroupRef)) {
        return [attr];
      }

      stack.add(attr.attributeGroupRef);
      const expanded = group.flatMap((groupAttr) => this.resolveAttributes([groupAttr], stack) ?? []);
      stack.delete(attr.attributeGroupRef);
      return expanded.length > 0 ? expanded : [attr];
    });
  }
}
