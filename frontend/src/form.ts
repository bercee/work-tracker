import type { z } from 'zod';

export type Parsed<Request> = { data: Request } | { error: string };

// Validates a request built from form inputs with the shared schema; the message is the first issue's.
export function parseRequest<Schema extends z.ZodType>(schema: Schema, input: unknown): Parsed<z.infer<Schema>> {
  const result = schema.safeParse(input);
  return result.success ? { data: result.data } : { error: result.error.issues[0]!.message };
}

const plainNumber = /^-?\d+(\.\d+)?$/;

// An empty input is missing (undefined), not 0. Only plain decimal spellings convert; anything else (1e3, 0x10) is
// NaN, so the shared schema rejects it. Negatives convert so the schema can report them.
export const numberOf = (text: string): number | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return plainNumber.test(trimmed) ? Number(trimmed) : NaN;
};
