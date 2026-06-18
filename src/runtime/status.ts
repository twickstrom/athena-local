import type { ServiceStatus } from "./types.ts";

export function parseContainerState(
  serviceName: string,
  output: string,
): ServiceStatus {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    return {
      name: serviceName,
      state: "failed",
      healthy: false,
      message: "Container inspect output was not valid JSON.",
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      name: serviceName,
      state: "failed",
      healthy: false,
      message: "Container inspect output was not an object.",
    };
  }

  const record = parsed as Record<string, unknown>;
  const status = typeof record.Status === "string" ? record.Status : undefined;
  const health =
    typeof record.Health === "object" && record.Health !== null
      ? (record.Health as Record<string, unknown>)
      : undefined;
  const healthStatus =
    typeof health?.Status === "string" ? health.Status : undefined;

  return {
    name: serviceName,
    state: mapContainerStatus(status),
    healthy: status === "running" && (healthStatus === undefined || healthStatus === "healthy"),
    ...(healthStatus === undefined ? {} : { message: `health=${healthStatus}` }),
  };
}

export function missingServiceStatus(
  serviceName: string,
  message: string,
): ServiceStatus {
  return {
    name: serviceName,
    state: "missing",
    healthy: false,
    message,
  };
}

function mapContainerStatus(status: string | undefined): ServiceStatus["state"] {
  switch (status) {
    case "created":
      return "created";
    case "running":
      return "running";
    case "restarting":
      return "starting";
    case "paused":
    case "exited":
    case "dead":
      return "stopped";
    default:
      return "failed";
  }
}
