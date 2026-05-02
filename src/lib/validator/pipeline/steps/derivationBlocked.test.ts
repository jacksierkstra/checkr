import { validateDerivationBlocked } from "@lib/validator/pipeline/steps/derivationBlocked";

const parser = new DOMParser();

function makeNode(tag = "item"): Element {
  return parser.parseFromString(`<${tag}/>`, "application/xml").documentElement!;
}

describe("validateDerivationBlocked", () => {
  it("returns [] when derivationBlocked is not set", () => {
    expect(validateDerivationBlocked(makeNode(), { name: "item" })).toEqual([]);
  });

  it("returns a DERIVATION_BLOCKED error when derivationBlocked=extension", () => {
    const errors = validateDerivationBlocked(makeNode(), {
      name: "item",
      derivationBlocked: "extension",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("DERIVATION_BLOCKED");
    expect(errors[0].element).toBe("item");
    expect(errors[0].expected).toBe("extension");
  });

  it("returns a DERIVATION_BLOCKED error when derivationBlocked=restriction", () => {
    const errors = validateDerivationBlocked(makeNode(), {
      name: "item",
      derivationBlocked: "restriction",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("DERIVATION_BLOCKED");
    expect(errors[0].expected).toBe("restriction");
  });

  it("returns a DERIVATION_BLOCKED error when derivationBlocked=substitution", () => {
    const errors = validateDerivationBlocked(makeNode(), {
      name: "item",
      derivationBlocked: "substitution",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("DERIVATION_BLOCKED");
    expect(errors[0].expected).toBe("substitution");
  });
});
