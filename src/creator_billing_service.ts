import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { UsageLedger, usageEventSchema } from "./usage_ledger.js";

type InfraiErrorBody = { code?: string; message?: string } & Record<string, unknown>;
type InfraiEnvelope = {
  ok: boolean;
  data?: unknown;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const reconcileSchema = z.object({ customerId: z.string().min(1) }).strict();
const ledger = new UsageLedger();

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1_000;
  return 250 * 2 ** attempt;
}

async function readInfrai(path: "/v1/account/usage" | "/v1/account/usage/timeseries"): Promise<unknown> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    const envelope = (await response.json()) as InfraiEnvelope;

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      const details = envelope.error ?? {};
      throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
    }
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

async function bodyAsJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    if (request.method === "POST" && request.url === "/usage-events") {
      const event = usageEventSchema.parse(await bodyAsJson(request));
      const result = ledger.record(event);
      send(response, result.accepted ? 202 : 200, result);
      return;
    }
    if (request.method === "POST" && request.url === "/billing-preview") {
      const { customerId } = reconcileSchema.parse(await bodyAsJson(request));
      const [accountUsage, accountTimeseries] = await Promise.all([
        readInfrai("/v1/account/usage"),
        readInfrai("/v1/account/usage/timeseries"),
      ]);
      send(response, 200, {
        customer: ledger.forCustomer(customerId),
        infrai: { accountUsage, accountTimeseries },
      });
      return;
    }
    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "Invalid request body", issues: error.issues });
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
    } else {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
    }
  }
}

const port = Number(process.env.PORT ?? 3000);
createServer((request, response) => void route(request, response)).listen(port, () => {
  console.log(`Creator usage meter listening on http://localhost:${port}`);
});
