import type { AthenaOperationHandlers } from "../protocol/athena-types.ts";
import { awsError, AthenaProtocolError } from "../protocol/errors.ts";
import { routeAthenaRequest } from "../protocol/router.ts";

export interface HttpHandlerOptions {
  readonly handlers: AthenaOperationHandlers;
}

export function createAthenaHttpHandler(options: HttpHandlerOptions) {
  return async function handleAthenaHttpRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "athena-local",
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return toResponse(
        awsError(
          new AthenaProtocolError(
            "InvalidRequestException",
            "Request body must be valid JSON.",
          ),
        ),
      );
    }

    const routed = await routeAthenaRequest(
      {
        method: request.method,
        headers: headersToObject(request.headers),
        body,
      },
      options.handlers,
    );

    return toResponse(routed);
  };
}

function toResponse(response: {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}): Response {
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: response.headers,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function headersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}
