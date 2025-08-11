import * as z from "zod";

export const ServiceHealth = z.object({
  failing: z.boolean(),
  minResponseTime: z.coerce.number(),
});

export type ServiceHealth = z.infer<typeof ServiceHealth>;

export const Payment = z.object({
  correlationId: z.uuidv4(),
  amount: z.number(),
  requestedAt: z.iso.datetime().optional(),
});

export type Payment = z.infer<typeof Payment>;

export const Summary = z.object({
  totalRequests: z.coerce.number().int(),
  totalAmount: z.coerce.number(),
});

export type Summary = z.infer<typeof Summary>;

export enum Processor {
  Default = "default",
  Fallback = "fallback",
};
