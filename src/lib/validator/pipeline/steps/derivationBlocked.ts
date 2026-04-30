import { NodeValidationStep } from "@lib/types/validation";

export const validateDerivationBlocked: NodeValidationStep = (_node, schema) => {
  if (!schema.derivationBlocked) return [];

  return [
    {
      code: "DERIVATION_BLOCKED",
      message: `Element <${schema.name}> uses a derivation blocked by schema rules.`,
      element: schema.name,
      expected: schema.derivationBlocked,
    },
  ];
};
