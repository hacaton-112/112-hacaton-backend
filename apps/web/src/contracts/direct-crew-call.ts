import { z } from "zod";

const MetadataSchema = z.object({
  eventId: z.uuid(),
  sessionId: z.string().min(1),
  timestamp: z.iso.datetime(),
});

export const DirectCrewCallServerEventSchema = z.discriminatedUnion("type", [
  MetadataSchema.extend({ type: z.literal("socket.ready") }).strict(),
  MetadataSchema.extend({
    type: z.literal("call.connected"),
    dialedNumber: z.string().min(1),
    callsign: z.string().min(1).nullable(),
    purpose: z.enum(["handoff", "progress_check"]),
  }).strict(),
  MetadataSchema.extend({ type: z.literal("listen.started") }).strict(),
  MetadataSchema.extend({ type: z.literal("listen.stopped") }).strict(),
  MetadataSchema.extend({
    type: z.literal("transcript"),
    text: z.string().min(1),
    complete: z.boolean(),
    missingFields: z.array(
      z.enum(["address", "incident", "description", "victims"]),
    ),
  }).strict(),
  MetadataSchema.extend({
    type: z.literal("audio.start"),
    promptId: z.uuid(),
    text: z.string().min(1),
    sampleRate: z.number().int().min(8_000).max(192_000),
  }).strict(),
  MetadataSchema.extend({
    type: z.literal("audio.done"),
    promptId: z.uuid(),
  }).strict(),
  MetadataSchema.extend({
    type: z.literal("call.ended"),
    outcome: z.enum(["completed", "abandoned", "unknown_number"]),
  }).strict(),
  MetadataSchema.extend({
    type: z.literal("error"),
    code: z.enum([
      "invalid-command",
      "call-already-started",
      "call-not-started",
      "call-failed",
    ]),
    message: z.string().min(1),
  }).strict(),
]);

export type DirectCrewCallServerEvent = z.infer<
  typeof DirectCrewCallServerEventSchema
>;

export type DirectCrewCallClientCommand =
  | {
      readonly type: "start";
      readonly eventId: string;
      readonly exerciseId: string;
      readonly dialedNumber: string;
    }
  | {
      readonly type: "prompt.played";
      readonly eventId: string;
      readonly promptId: string;
    }
  | { readonly type: "end"; readonly eventId: string };
