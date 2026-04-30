import { GroupResolver } from "./GroupResolver";
import { XSDElement, XSDSchema } from "@lib/types/xsd";

describe("GroupResolver", () => {
  it("expands group and attributeGroup references", () => {
    const schema: XSDSchema = {
      elements: [],
      types: {},
      groups: {
        nameGroup: [{ name: "first", type: "xs:string" }, { name: "last", type: "xs:string" }],
      },
      attributeGroups: {
        metaAttrs: [{ name: "lang", type: "xs:string" }],
      },
    };

    const resolver = new GroupResolver(schema);
    const resolved = resolver.resolveGroups({
      name: "person",
      children: [{ name: "nameGroup", groupRef: "nameGroup", minOccurs: 1, maxOccurs: 1 }],
      attributes: [{ name: "metaAttrs", attributeGroupRef: "metaAttrs", use: "optional" }],
    });

    expect(resolved.children).toHaveLength(2);
    expect(resolved.children?.map((c) => c.name)).toEqual(["first", "last"]);
    expect(resolved.attributes).toHaveLength(1);
    expect(resolved.attributes?.[0].name).toBe("lang");
  });
});
