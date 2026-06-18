// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

export interface AwsJsonErrorBody {
  readonly __type: string;
  readonly message: string;
}

export interface AwsJsonResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export class AthenaProtocolError extends Error {
  override readonly name: string;
  readonly status: number;

  constructor(name: string, message: string, status = 400) {
    super(message);
    this.name = name;
    this.status = status;
  }
}

export function awsJson(body: unknown, status = 200): AwsJsonResponse {
  return {
    status,
    headers: {
      "content-type": "application/x-amz-json-1.1",
    },
    body,
  };
}

export function awsError(error: AthenaProtocolError): AwsJsonResponse {
  return awsJson(
    {
      __type: error.name,
      message: error.message,
    } satisfies AwsJsonErrorBody,
    error.status,
  );
}
