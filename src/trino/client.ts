import { parseTrinoPage } from "./parse.ts";
import type {
  TrinoClientConfig,
  TrinoPage,
  TrinoQuerySubmission,
} from "./types.ts";

export type TrinoFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class TrinoClient {
  readonly #config: TrinoClientConfig;
  readonly #fetch: TrinoFetch;

  constructor(config: TrinoClientConfig, fetchImplementation: TrinoFetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImplementation;
  }

  async submit(sql: string): Promise<TrinoQuerySubmission> {
    const response = await this.#fetch(`${this.#config.endpoint}/v1/statement`, {
      method: "POST",
      headers: this.#headers(),
      body: sql,
    });

    const page = await this.#parseResponse(response);

    return {
      page,
      queryId: page.id,
      ...(page.nextUri === undefined ? {} : { nextUri: page.nextUri }),
    };
  }

  async fetchNext(nextUri: string): Promise<TrinoPage> {
    const response = await this.#fetch(nextUri, {
      method: "GET",
      headers: this.#headers(),
    });

    return this.#parseResponse(response);
  }

  async cancel(nextUri: string): Promise<void> {
    const response = await this.#fetch(nextUri, {
      method: "DELETE",
      headers: this.#headers(),
    });

    if (!response.ok) {
      throw new Error(
        `Trino cancellation failed with HTTP ${response.status}: ${await response.text()}`,
      );
    }
  }

  #headers(): Readonly<Record<string, string>> {
    return {
      "content-type": "text/plain",
      "x-trino-user": this.#config.user,
      "x-trino-catalog": this.#config.catalog,
      ...(this.#config.schema === undefined
        ? {}
        : { "x-trino-schema": this.#config.schema }),
    };
  }

  async #parseResponse(response: Response): Promise<TrinoPage> {
    if (!response.ok) {
      throw new Error(
        `Trino request failed with HTTP ${response.status}: ${await response.text()}`,
      );
    }

    return parseTrinoPage(await response.json());
  }
}
