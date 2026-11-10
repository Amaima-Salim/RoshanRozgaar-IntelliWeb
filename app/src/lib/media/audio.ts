/** Magic-byte detection for recorded answers; the client-declared type is never trusted. */
export type AudioType = "audio/webm" | "audio/ogg" | "audio/wav" | "audio/mp4" | "audio/mpeg";

export function sniffAudio(b: Uint8Array): AudioType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return "audio/webm";
  if (b.length >= 4 && ascii(0, 4) === "OggS") return "audio/ogg";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (b.length >= 12 && ascii(4, 8) === "ftyp") return "audio/mp4";
  if (b.length >= 3 && ascii(0, 3) === "ID3") return "audio/mpeg";
  if (b.length >= 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return "audio/mpeg";
  return null;
}
