import { createApp } from "./app.js";

const DEFAULT_PORT = 3000;

function resolvePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }

  return port;
}

const port = resolvePort(process.env.PORT);

createApp().listen(port, () => {
  console.log(`wellness-platform listening on http://localhost:${port}`);
});
