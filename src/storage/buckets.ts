export interface BucketManager {
  readonly ensureBucket: (bucket: string) => Promise<void>;
}

export interface SigV4BucketManagerOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly fetch?: (input: URL, init: RequestInit) => Promise<Response>;
  readonly now?: () => Date;
}

export class SigV4BucketManager implements BucketManager {
  readonly #endpoint: string;
  readonly #region: string;
  readonly #accessKeyId: string;
  readonly #secretAccessKey: string;
  readonly #fetch: (input: URL, init: RequestInit) => Promise<Response>;
  readonly #now: () => Date;

  constructor(options: SigV4BucketManagerOptions) {
    this.#endpoint = options.endpoint;
    this.#region = options.region;
    this.#accessKeyId = options.accessKeyId;
    this.#secretAccessKey = options.secretAccessKey;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
  }

  async ensureBucket(bucket: string): Promise<void> {
    validateBucketName(bucket);
    const head = await this.#request("HEAD", bucket);
    if (head.status >= 200 && head.status < 300) {
      return;
    }
    if (head.status !== 404) {
      throw new Error(`Bucket check failed for ${bucket}: HTTP ${head.status}`);
    }

    const created = await this.#request("PUT", bucket);
    if (created.status < 200 || created.status >= 300) {
      throw new Error(`Bucket creation failed for ${bucket}: HTTP ${created.status}`);
    }
  }

  async #request(method: "HEAD" | "PUT", bucket: string): Promise<Response> {
    const url = new URL(this.#endpoint);
    url.pathname = `/${bucket}`;
    url.search = "";
    const headers = await this.#signedHeaders(method, url);

    return this.#fetch(url, {
      method,
      headers,
    });
  }

  async #signedHeaders(
    method: string,
    url: URL,
  ): Promise<Readonly<Record<string, string>>> {
    const now = this.#now();
    const amzDate = toAmzDate(now);
    const date = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex("");
    const host = url.host;
    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      method,
      url.pathname,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const credentialScope = `${date}/${this.#region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join("\n");
    const signingKey = await getSigningKey(
      this.#secretAccessKey,
      date,
      this.#region,
    );
    const signature = await hmacHex(signingKey, stringToSign);

    return {
      authorization:
        `AWS4-HMAC-SHA256 Credential=${this.#accessKeyId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
  }
}

function validateBucketName(bucket: string): void {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("Bucket name is not valid for S3.");
  }
}

function toAmzDate(date: Date): string {
  return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

async function getSigningKey(
  secretAccessKey: string,
  date: string,
  region: string,
): Promise<Uint8Array> {
  const dateKey = await hmacBytes(utf8(`AWS4${secretAccessKey}`), date);
  const regionKey = await hmacBytes(dateKey, region);
  const serviceKey = await hmacBytes(regionKey, "s3");
  return hmacBytes(serviceKey, "aws4_request");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(utf8(value)));
  return hex(new Uint8Array(digest));
}

async function hmacHex(key: Uint8Array, value: string): Promise<string> {
  return hex(await hmacBytes(key, value));
}

async function hmacBytes(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toArrayBuffer(utf8(value)),
  );
  return new Uint8Array(signature);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
