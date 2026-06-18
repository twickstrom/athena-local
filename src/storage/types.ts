export type StorageBackendKind = "minio" | "s3";

export interface ObjectLocation {
  readonly bucket: string;
  readonly key: string;
}

export interface StorageWriteInput {
  readonly location: ObjectLocation;
  readonly contentType: string;
  readonly body: Blob | string | Uint8Array;
}

export interface StorageBackend {
  readonly kind: StorageBackendKind;
  readonly write: (input: StorageWriteInput) => Promise<void>;
  readonly read: (location: ObjectLocation) => Promise<Uint8Array>;
  readonly exists: (location: ObjectLocation) => Promise<boolean>;
  readonly deletePrefix: (scope: DeletePrefixScope) => Promise<void>;
}

export interface DeletePrefixScope {
  readonly bucket: string;
  readonly prefix: string;
  readonly force: boolean;
  readonly remote: boolean;
}
