import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const SchemaVersionSchema = z.literal(SCHEMA_VERSION, {
  errorMap: () => ({
    message: `Unsupported schema version; expected ${SCHEMA_VERSION}`,
  }),
});

export const IdentifierSchema = z
  .string()
  .min(1, "Identifier cannot be empty")
  .max(80, "Identifier cannot exceed 80 characters")
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    "Identifier must be lowercase and URL-safe",
  );

export const MessageKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);

export const FiniteNumberSchema = z.number().finite();
export const NonNegativeNumberSchema = FiniteNumberSchema.nonnegative();
export const UnitIntervalSchema = FiniteNumberSchema.min(0).max(1);
export const PercentageSchema = FiniteNumberSchema.min(0).max(100);

export const CoordinateSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  })
  .strict();

export type Coordinate = z.infer<typeof CoordinateSchema>;
