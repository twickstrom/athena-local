// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2026 Tim Wickstrom

import type { DeletePrefixScope, ObjectLocation } from "./types.ts";

export interface SafetyIssue {
  readonly field: string;
  readonly message: string;
}

export function validateObjectLocation(
  location: ObjectLocation,
): readonly SafetyIssue[] {
  const issues: SafetyIssue[] = [];

  if (!isValidBucketName(location.bucket)) {
    issues.push({
      field: "bucket",
      message: "Bucket name must be a valid S3-compatible bucket name.",
    });
  }

  if (isUnsafeKey(location.key)) {
    issues.push({
      field: "key",
      message: "Object key must be relative and must not contain traversal.",
    });
  }

  return issues;
}

export function validateDeletePrefix(
  scope: DeletePrefixScope,
): readonly SafetyIssue[] {
  const issues: SafetyIssue[] = [];

  if (!isValidBucketName(scope.bucket)) {
    issues.push({
      field: "bucket",
      message: "Bucket name must be a valid S3-compatible bucket name.",
    });
  }

  if (isUnsafePrefix(scope.prefix)) {
    issues.push({
      field: "prefix",
      message: "Prefix must be non-empty, relative, and scoped below bucket root.",
    });
  }

  if (scope.remote && !scope.force) {
    issues.push({
      field: "force",
      message: "Remote deletion requires explicit force.",
    });
  }

  return issues;
}

function isValidBucketName(bucket: string): boolean {
  return (
    bucket.length >= 3 &&
    bucket.length <= 63 &&
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) &&
    !bucket.includes("..") &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(bucket)
  );
}

function isUnsafeKey(key: string): boolean {
  return (
    key.length === 0 ||
    key.startsWith("/") ||
    key.includes("../") ||
    key.includes("..\\") ||
    key.includes("\0")
  );
}

function isUnsafePrefix(prefix: string): boolean {
  const trimmed = prefix.trim();
  return (
    trimmed.length === 0 ||
    trimmed === "/" ||
    trimmed === "." ||
    trimmed === ".." ||
    isUnsafeKey(trimmed)
  );
}
