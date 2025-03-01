import { NodeValidationStep } from "@lib/types/validation";
import { XSDAttribute } from "@lib/types/xsd";

export const validateAttributes: NodeValidationStep = (node, schema) => {
  if (!schema.attributes || schema.attributes.length === 0) return [];

  return schema.attributes.flatMap((attr: XSDAttribute) => {
    const value = node.getAttribute(attr.name);
    const errors: string[] = [];

    // Required attribute check (treat empty string as missing)
    if (attr.use === "required" && (!value || value.trim() === "")) {
      errors.push(
        `Missing required attribute '${attr.name}' in element <${schema.name}>.`
      );
    }

    // Fixed value enforcement
    if (attr.fixed !== undefined && value !== null && value !== attr.fixed) {
      errors.push(
        `Attribute '${attr.name}' in element <${schema.name}> must be fixed to '${attr.fixed}', but found '${value}'.`
      );
    }

    // Basic type validation
    if (value !== null && value.trim() !== "") {
      if (attr.type === "xs:integer" && !/^-?\d+$/.test(value)) {
        errors.push(
          `Attribute '${attr.name}' in element <${schema.name}> must be an integer, but found '${value}'.`
        );
      }
      if (
        attr.type === "xs:boolean" &&
        !["true", "false", "1", "0"].includes(value)
      ) {
        errors.push(
          `Attribute '${attr.name}' in element <${schema.name}> must be a boolean (true/false/1/0), but found '${value}'.`
        );
      }
    }

    return errors; // Return this attribute's errors
  });
};
