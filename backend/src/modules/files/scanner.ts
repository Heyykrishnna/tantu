import { createConnection } from "node:net";
import type { RuntimeSettings } from "../../config/runtime.js";
import { maximumFileBytes } from "./store.js";

export type ScanVerdict = "clean" | "rejected" | "unavailable";

export async function scan(bytes: Buffer, settings: Pick<RuntimeSettings, "scannerHost" | "scannerPort">): Promise<ScanVerdict> {
  if (!bytes.length || bytes.length > maximumFileBytes) return "rejected";
  return new Promise((resolve) => {
    const socket = createConnection({ host: settings.scannerHost, port: settings.scannerPort });
    let response = "";
    let settled = false;
    const deadline = setTimeout(() => finish("unavailable"), 15_000);
    function finish(result: ScanVerdict): void {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(result);
    }
    socket.once("error", () => finish("unavailable"));
    socket.once("close", () => finish("unavailable"));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (response.length > 1024) return finish("unavailable");
      if (!response.includes("\0") && !response.includes("\n")) return;
      const reply = response.split(/[\0\n]/)[0];
      if (reply === "stream: OK") finish("clean");
      else if (reply?.startsWith("stream: ") && reply.endsWith(" FOUND")) finish("rejected");
      else finish("unavailable");
    });
    socket.once("connect", () => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      socket.write(Buffer.concat([Buffer.from("zINSTREAM\0"), length, bytes, Buffer.alloc(4)]));
    });
  });
}
