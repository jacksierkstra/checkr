// elementAssembler.test.ts
import { XSDElement } from "@lib/types/xsd";
import { ElementAssembler } from "./elementAssembler";

describe("ElementAssembler", () => {
  let assembler: ElementAssembler;

  beforeEach(() => {
    assembler = new ElementAssembler();
  });

  describe("mergePartialElements", () => {
    it("should correctly merge arrays of partial elements", () => {
      // Each inner array represents partial pieces for one element.
      const partials: Partial<XSDElement>[][] = [
        [
          { name: "element1" },
          { namespace: "http://example.com" },
          { children: [{ name: "child1" }] },
        ],
        [
          { name: "element2" },
          { namespace: "http://example.org" },
        ],
      ];

      // Since mergePartialElements now returns Partial<XSDElement>[],
      // we don't enforce that each merged element has a name. We'll filter later.
      const merged = assembler.mergePartialElements(partials);

      expect(merged).toEqual([
        { name: "element1", namespace: "http://example.com", children: [{ name: "child1" }] },
        { name: "element2", namespace: "http://example.org" },
      ]);
    });
  });

  describe("filterValidElements", () => {
    it("should filter out elements missing the 'name' property", () => {
      const elements: Partial<XSDElement>[] = [
        { name: "element1", namespace: "http://example.com" },
        { namespace: "http://example.org" }, // Missing 'name'
        { name: "element2" },
      ];

      const valid = assembler.filterValidElements(elements);

      // Only elements with a defined 'name' should remain.
      expect(valid).toEqual([
        { name: "element1", namespace: "http://example.com" },
        { name: "element2" },
      ]);
    });
  });

  describe("applyNamespace", () => {
    it("should apply the namespace recursively to elements and their children", () => {
      const elements: XSDElement[] = [
        {
          name: "element1",
          namespace: undefined,
          children: [
            { name: "child1", namespace: undefined },
            { name: "child2", namespace: undefined },
          ],
        },
        { name: "element2", namespace: undefined },
      ];

      const namespace = "http://example.com";
      const result = assembler.applyNamespace(elements, namespace);

      expect(result).toEqual([
        {
          name: "element1",
          namespace,
          children: [
            { name: "child1", namespace },
            { name: "child2", namespace },
          ],
        },
        { name: "element2", namespace },
      ]);
    });
  });
});
