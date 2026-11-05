// Starter Next.js på den første ledige port fra 3456 og opefter,
// så Inspo Studio ikke støder sammen med andre projekter, der kører.
import net from "node:net";
import { spawn } from "node:child_process";

const mode = process.argv[2] === "start" ? "start" : "dev";
const first = Number(process.env.PORT) || 3456;

function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "0.0.0.0");
  });
}

let port = first;
while (!(await isFree(port))) {
  port++;
  if (port > first + 200) {
    console.error(`Fandt ingen ledig port mellem ${first} og ${first + 200}.`);
    process.exit(1);
  }
}

if (port !== first) console.log(`Port ${first} er optaget, bruger ${port} i stedet.`);
console.log(`\n  Inspo Studio: http://localhost:${port}\n`);

const child = spawn("npx", ["next", mode, "-p", String(port)], { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
