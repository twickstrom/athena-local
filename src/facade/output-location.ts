// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

export interface ParsedS3Uri {
  readonly bucket: string;
  readonly prefix: string;
}

export function parseS3OutputLocation(value: string): ParsedS3Uri {
  if (!value.startsWith("s3://")) {
    throw new Error("OutputLocation must be an s3:// URI.");
  }

  const withoutScheme = value.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  const bucket = slashIndex === -1 ? withoutScheme : withoutScheme.slice(0, slashIndex);
  const prefix = slashIndex === -1 ? "" : withoutScheme.slice(slashIndex + 1);

  if (bucket.length === 0) {
    throw new Error("OutputLocation must include a bucket.");
  }

  if (prefix.length === 0) {
    throw new Error("OutputLocation must include a scoped prefix.");
  }

  return {
    bucket,
    prefix,
  };
}
