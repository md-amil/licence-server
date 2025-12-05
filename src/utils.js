import { Buffer } from "buffer";
const def =  "OdxXFzfDNCjjRjJbBWZQ5A=="
export function keyId2UUId(base64KeyId){
    const buf = Buffer.from(base64KeyId, "base64");
    return [
        buf.toString("hex", 0, 4),
        buf.toString("hex", 4, 6),
        buf.toString("hex", 6, 8),
        buf.toString("hex", 8, 10),
        buf.toString("hex", 10, 16),
    ].join("-");
}