import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { validateIdentityConstraints } from "./identityConstraints";

const parser = new DOMParser();

function parse(xml: string): XMLDocument {
  return parser.parseFromString(xml, "application/xml");
}

describe("validateIdentityConstraints", () => {
  it("reports key/unique violations and invalid keyrefs", () => {
    const schema: XSDSchema = {
      elements: [
        {
          name: "people",
          identityConstraints: [
            { kind: "key", name: "personKey", selector: "person", fields: ["@id"] },
            { kind: "unique", name: "uniqueEmail", selector: "person", fields: ["@email"] },
            { kind: "keyref", name: "personRef", refer: "personKey", selector: "person", fields: ["@friend"] },
          ],
          children: [
            {
              name: "person",
              attributes: [
                { name: "id", type: "xs:string" },
                { name: "email", type: "xs:string" },
                { name: "friend", type: "xs:string" },
              ],
            },
          ],
        } as XSDElement,
      ],
      types: {},
    };

    const xml = parse(
      '<people><person id="a" email="e1" friend="missing"/><person id="a" email="e1"/></people>',
    );
    const errors = validateIdentityConstraints(xml, schema);
    expect(errors.some((e) => e.code === "UNIQUENESS_VIOLATION")).toBe(true);
    expect(errors.some((e) => e.code === "REFERENCE_VIOLATION")).toBe(true);
  });
});
