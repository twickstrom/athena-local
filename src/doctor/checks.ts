import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { AthenaLocalConfig } from "../config/types.ts";

export interface DoctorPortStatus {
  readonly name: string;
  readonly port: number;
  readonly available: boolean;
  readonly message?: string;
}

export interface DoctorWritableDirectoryStatus {
  readonly path: string;
  readonly writable: boolean;
  readonly message?: string;
}

export interface HostDoctorChecks {
  readonly checkPort: (name: string, port: number) => Promise<DoctorPortStatus>;
  readonly checkWritableDirectory: (
    path: string,
  ) => Promise<DoctorWritableDirectoryStatus>;
}

export interface HostDiagnostics {
  readonly ports: readonly DoctorPortStatus[];
  readonly writableDirectories: readonly DoctorWritableDirectoryStatus[];
}

export async function collectHostDiagnostics(
  config: AthenaLocalConfig,
  checks: HostDoctorChecks = createDefaultHostDoctorChecks(),
): Promise<HostDiagnostics> {
  const ports = await Promise.all(
    Object.entries(config.ports).map(([name, port]) => checks.checkPort(name, port)),
  );
  const writableDirectories = await Promise.all([
    checks.checkWritableDirectory(process.cwd()),
    checks.checkWritableDirectory(join(process.cwd(), ".athena-local")),
  ]);

  return {
    ports,
    writableDirectories,
  };
}

export function createDefaultHostDoctorChecks(): HostDoctorChecks {
  return {
    checkPort: async (name, port) => {
      let listener: { stop: () => void } | undefined;
      try {
        listener = Bun.listen({
          hostname: "127.0.0.1",
          port,
          socket: {
            data() {},
          },
        });
        return {
          name,
          port,
          available: true,
        };
      } catch (error) {
        return {
          name,
          port,
          available: false,
          message: error instanceof Error ? error.message : "Port is unavailable.",
        };
      } finally {
        listener?.stop();
      }
    },
    checkWritableDirectory: async (path) => {
      const probe = join(path, `.athena-local-write-test-${process.pid}`);
      try {
        await mkdir(path, { recursive: true });
        await Bun.write(probe, "");
        await rm(probe, { force: true });
        return {
          path,
          writable: true,
        };
      } catch (error) {
        return {
          path,
          writable: false,
          message:
            error instanceof Error ? error.message : "Directory is not writable.",
        };
      }
    },
  };
}
