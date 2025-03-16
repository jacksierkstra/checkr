import { GlobalValidationStep } from '@lib/types/validation';

export const validateOccurrence: GlobalValidationStep = (nodes, schema) => {
  const errors: string[] = [];
  const count = nodes.length;

  if (schema.minOccurs !== undefined && count < schema.minOccurs) {
    errors.push(`Element ${schema.name} occurs ${count} times, but should occur at least ${schema.minOccurs} times.`);
  }

  if (schema.maxOccurs !== undefined && schema.maxOccurs !== 'unbounded' && count > schema.maxOccurs) {
    errors.push(`Element ${schema.name} occurs ${count} times, but should occur at most ${schema.maxOccurs} times.`);
  }

  return errors;
};

