import { XSDElement, XSDChoice } from "@lib/types/xsd.js";

type SubstitutionMap = { [head: string]: string[] };

/**
 * Builds a transitive substitution group map from parsed root elements and
 * enriches resolved child schemas with `allowedSubstitutes` so validators
 * can accept substitute elements without needing access to the full schema.
 */
export class SubstitutionGroupResolver {
  /**
   * Builds a transitive substitution group map from root element declarations.
   * The map key is the head element name; the value is all element names
   * (including transitive members) that may substitute that head.
   */
  buildMap(elements: XSDElement[]): SubstitutionMap {
    // Build direct substitution map first
    const direct: { [head: string]: string[] } = {};
    for (const el of elements) {
      if (el.substitutionGroup) {
        if (!direct[el.substitutionGroup]) direct[el.substitutionGroup] = [];
        direct[el.substitutionGroup].push(el.name);
      }
    }

    // Compute transitive closure for each head
    const map: SubstitutionMap = {};
    for (const head of Object.keys(direct)) {
      const members = new Set<string>(direct[head]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const member of [...members]) {
          if (direct[member]) {
            for (const transitiveMember of direct[member]) {
              if (!members.has(transitiveMember)) {
                members.add(transitiveMember);
                changed = true;
              }
            }
          }
        }
      }
      map[head] = [...members];
    }

    return map;
  }

  /**
   * Walks a resolved element tree and adds `allowedSubstitutes` to every
   * child whose name is a head element in the substitution map.
   */
  enrichElements(elements: XSDElement[], map: SubstitutionMap): XSDElement[] {
    return elements.map((el) => this.enrichElement(el, map));
  }

  private enrichElement(el: XSDElement, map: SubstitutionMap): XSDElement {
    const substitutes = map[el.name];
    const blocksSubstitution = this.blocksSubstitution(el.block);
    const enriched: XSDElement = substitutes && !blocksSubstitution
      ? { ...el, allowedSubstitutes: substitutes }
      : substitutes && blocksSubstitution
        ? { ...el, blockedSubstitutes: substitutes }
        : { ...el };

    if (enriched.children && enriched.children.length > 0) {
      enriched.children = enriched.children.map((child) => this.enrichElement(child, map));
    }
    if (enriched.choices && enriched.choices.length > 0) {
      enriched.choices = enriched.choices.map((choice: XSDChoice) => ({
        ...choice,
        elements: choice.elements.map((choiceEl) => this.enrichElement(choiceEl, map)),
      }));
    }

    return enriched;
  }

  private blocksSubstitution(block?: string): boolean {
    if (!block) return false;
    const tokens = block.split(/\s+/).filter(Boolean);
    return tokens.includes("#all") || tokens.includes("substitution");
  }
}
