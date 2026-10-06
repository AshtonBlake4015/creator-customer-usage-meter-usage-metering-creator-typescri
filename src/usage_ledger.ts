import { z } from "zod";

export const usageEventSchema = z.discriminatedUnion("kind", [
  z.object({
    customerId: z.string().min(1),
    eventId: z.string().min(1),
    kind: z.literal("digital_asset_delivery"),
    bytes: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    customerId: z.string().min(1),
    eventId: z.string().min(1),
    kind: z.literal("subscriber_update"),
    subscribers: z.number().int().positive(),
  }).strict(),
  z.object({
    customerId: z.string().min(1),
    eventId: z.string().min(1),
    kind: z.literal("content_processing"),
    seconds: z.number().finite().positive(),
  }).strict(),
]);

export type UsageEvent = z.infer<typeof usageEventSchema>;
export type UsageBucket = UsageEvent["kind"];

export interface MeteredUsage {
  customerId: string;
  units: Record<UsageBucket, number>;
}

export class UsageLedger {
  private readonly events = new Map<string, UsageEvent>();

  record(event: UsageEvent): { accepted: boolean; usage: MeteredUsage } {
    const eventKey = `${event.customerId}\0${event.eventId}`;
    const accepted = !this.events.has(eventKey);
    if (accepted) this.events.set(eventKey, event);
    return { accepted, usage: this.forCustomer(event.customerId) };
  }

  forCustomer(customerId: string): MeteredUsage {
    const units: Record<UsageBucket, number> = {
      digital_asset_delivery: 0,
      subscriber_update: 0,
      content_processing: 0,
    };

    for (const event of this.events.values()) {
      if (event.customerId !== customerId) continue;
      if (event.kind === "digital_asset_delivery") {
        units[event.kind] += Math.ceil(event.bytes / 1_000_000);
      } else if (event.kind === "subscriber_update") {
        units[event.kind] += event.subscribers;
      } else {
        units[event.kind] += Math.ceil(event.seconds / 60);
      }
    }

    return { customerId, units };
  }
}
