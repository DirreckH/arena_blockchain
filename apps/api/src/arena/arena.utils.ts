import type { Prisma } from "@prisma/client";

import { ArenaValidationError } from "./arena.errors";

export type TimestampInput = Date | string;
export type BinaryOption = 0 | 1;

export const toDate = (value: TimestampInput): Date =>
  value instanceof Date ? value : new Date(value);

export const isNonNegativeIntegerString = (value: string): boolean =>
  /^[0-9]+$/.test(value);

export const assertNonNegativeIntegerString = (
  value: string,
  field: string,
): void => {
  if (!isNonNegativeIntegerString(value)) {
    throw new ArenaValidationError(`${field} must be a non-negative integer string.`);
  }
};

export const assertBinaryOptions: (options: readonly string[]) => void = (
  options,
): void => {
  if (options.length !== 2) {
    throw new ArenaValidationError("MVP propositions must define exactly two options.");
  }
};

export const assertBinaryOption: (
  option: number,
  field: string,
) => asserts option is BinaryOption = (option, field): asserts option is BinaryOption => {
  if (option !== 0 && option !== 1) {
    throw new ArenaValidationError(`${field} must be 0 or 1 in the MVP runtime.`);
  }
};

export const buildResponsePayload = (
  payload: Prisma.InputJsonValue | undefined,
  selectedOption: BinaryOption,
  confirmationOption: BinaryOption,
): Prisma.InputJsonValue =>
  payload ?? {
    selectedOption,
    confirmationOption,
  };
