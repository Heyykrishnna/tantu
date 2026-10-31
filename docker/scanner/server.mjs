import { createServer } from "node:net";

const port = Number(process.env.PORT || "3310");
const host = process.env.HOST || "0.0.0.0";

const server = createServer((socket) => {
  let buffer = Buffer.alloc(0);
  let mode = "command";
  let streamBytes = Buffer.alloc(0);
  let expectedLength = 0;

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    if (mode === "command") {
      const pingIndex = buffer.indexOf("PING");
      if (pingIndex !== -1) {
        socket.write("PONG\0");
        buffer = buffer.subarray(pingIndex + 4);
        if (buffer[0] === 0 || buffer[0] === 10) buffer = buffer.subarray(1);
        return;
      }

      const versionIndex = buffer.indexOf("VERSION");
      if (versionIndex !== -1) {
        socket.write("ClamAV 1.4.6\n");
        buffer = buffer.subarray(versionIndex + 7);
        if (buffer[0] === 0 || buffer[0] === 10) buffer = buffer.subarray(1);
        return;
      }

      const zIndex = buffer.indexOf("zINSTREAM\0");
      if (zIndex !== -1) {
        mode = "stream_header";
        buffer = buffer.subarray(zIndex + 10);
      } else {
        const instreamIndex = buffer.indexOf("INSTREAM");
        if (instreamIndex !== -1) {
          mode = "stream_header";
          buffer = buffer.subarray(instreamIndex + 8);
          if (buffer[0] === 0 || buffer[0] === 10) buffer = buffer.subarray(1);
        }
      }
    }

    while (mode === "stream_header" || mode === "stream_chunk") {
      if (mode === "stream_header") {
        if (buffer.length < 4) return;
        expectedLength = buffer.readUInt32BE(0);
        buffer = buffer.subarray(4);
        if (expectedLength === 0) {
          const content = streamBytes.toString("utf8");
          const isMalware = content.includes("synthetic-malware") || content.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE");
          if (isMalware) {
            socket.end("stream: Eicar-Signature FOUND\0");
          } else {
            socket.end("stream: OK\0");
          }
          return;
        }
        mode = "stream_chunk";
      }

      if (mode === "stream_chunk") {
        if (buffer.length < expectedLength) return;
        const chunkData = buffer.subarray(0, expectedLength);
        streamBytes = Buffer.concat([streamBytes, chunkData]);
        buffer = buffer.subarray(expectedLength);
        mode = "stream_header";
      }
    }
  });

  socket.on("error", () => {
    socket.destroy();
  });
});

server.listen(port, host, () => {
  process.stdout.write(`Scanner service listening on ${host}:${port}\n`);
});

