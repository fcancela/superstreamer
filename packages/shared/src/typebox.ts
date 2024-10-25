import { Type as t, TypeRegistry, Kind } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { by639_2T } from "iso-language-codes";
import type { Static, SchemaOptions, TSchema } from "@sinclair/typebox";
import type { AssertError } from "@sinclair/typebox/value";

TypeRegistry.Set("StringEnum", (schema: { enum: string[] }, value: unknown) => {
  return typeof value === "string" && schema.enum.includes(value);
});

function StringEnum<T extends string[]>(
  values: [...T],
  options: SchemaOptions = {},
) {
  return t.Unsafe<T[number]>({
    ...options,
    [Kind]: "StringEnum",
    enum: values,
  });
}

export const LangCodeSchema = StringEnum(
  Object.keys(by639_2T) as (keyof typeof by639_2T)[],
);
LangCodeSchema.description = "ISO 639 (T2), 3 characters, language code.";
LangCodeSchema.$id = "#/components/schemas/LangCode";

export type LangCode = Static<typeof LangCodeSchema>;

export const VideoCodecSchema = StringEnum(["h264", "vp9", "hevc"]);
VideoCodecSchema.description = "Supported video codecs.";
VideoCodecSchema.$id = "#/components/schemas/VideoCodec";

export type VideoCodec = Static<typeof VideoCodecSchema>;

export const AudioCodecSchema = StringEnum(["aac", "ac3", "eac3"]);
AudioCodecSchema.description = "Supported audio codecs.";
AudioCodecSchema.$id = "#/components/schemas/AudioCodec";

export type AudioCodec = Static<typeof AudioCodecSchema>;

export function formatFails(error: AssertError) {
  return Array.from(error.Errors()).map((fail) => {
    return `${fail.path.substring(1)}: ${fail.value} (${fail.message})`;
  });
}

export function Base64Object<T extends TSchema>(schema: T) {
  const base64ToObject = (value: string) => {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  };
  return t
    .Transform(t.String())
    .Decode((value) => Value.Parse(schema, base64ToObject(value)))
    .Encode(() => "");
}
