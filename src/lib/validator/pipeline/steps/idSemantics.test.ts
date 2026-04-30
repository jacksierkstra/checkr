import { XSDElement, XSDSchema } from "@lib/types/xsd";
import { validateIdSemantics } from "./idSemantics";

const parser = new DOMParser();

function parse(xml: string): XMLDocument {
  return parser.parseFromString(xml, "application/xml");
}

describe("validateIdSemantics", () => {
  it("reports duplicate IDs and unresolved IDREFs", () => {
    const schema: XSDSchema = {
      elements: [
        {
          name: "people",
          children: [
            {
              name: "person",
              attributes: [
                { name: "id", type: "xs:ID", use: "required" },
                { name: "friend", type: "xs:IDREF" },
              ],
            },
          ],
        } as XSDElement,
      ],
      types: {},
    };

    const xml = parse('<people><person id="a" friend="missing"/><person id="a"/></people>');
    const errors = validateIdSemantics(xml, schema);
    expect(errors.some((e) => e.code === "DUPLICATE_ID")).toBe(true);
    expect(errors.some((e) => e.code === "UNRESOLVED_IDREF")).toBe(true);
  });
});
