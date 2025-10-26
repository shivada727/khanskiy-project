import type { DetailedHTMLProps, InputHTMLAttributes } from "react";

export type VirtualFileDescriptor = {
  path: string;
  content: string;
  type?: string;
};

export type DirectoryInputElement = DetailedHTMLProps<
  InputHTMLAttributes<HTMLInputElement>,
  HTMLInputElement
> & { webkitdirectory?: boolean | string; directory?: boolean | string };

export const APPLICATION_CONSTANTS = Object.freeze({
  serviceWorkerScriptPath: "/sw.js",
  serviceWorkerScriptType: "module" as const,
  broadcastChannelName: "vfs",
  runnerPagePath: "/runner.html",
  runnerEntryQueryParameter: "entry",
  virtualNamespacePrefix: "/virtual/",
  mainEntryFilePattern: /(^|\/)main\.m?js$/i,
  indexEntryFilePattern: /(^|\/)index\.m?js$/i,
  serviceWorkerPingSuccessValue: "ok",
});

export const APPLICATION_STATUS_MESSAGES = Object.freeze({
  idle: "idle",
  readingFiles: "reading files…",
  running: "running…",
});

export const APPLICATION_ERROR_MESSAGES = Object.freeze({
  serviceWorkerUnsupported: "ServiceWorker unsupported",
  serviceWorkerErrorPrefix: "SW error: ",
  serviceWorkerPingFailure:
    "SW not ready (no ping). Reload page, check /sw.js scope, or hard refresh.",
  entryNotReachablePrefix: "entry not reachable: ",
});

export const APPLICATION_LOG_MESSAGES = Object.freeze({
  virtualFileListPrefix: "VFS list:",
});

const MIME_TYPE_BY_EXTENSION = Object.freeze({
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".html": "text/html",
});

export async function ensureServiceWorkerReady() {
  if (!("serviceWorker" in navigator)) {
    throw new Error(APPLICATION_ERROR_MESSAGES.serviceWorkerUnsupported);
  }

  await navigator.serviceWorker.register(APPLICATION_CONSTANTS.serviceWorkerScriptPath, {
    type: APPLICATION_CONSTANTS.serviceWorkerScriptType,
  });
  await navigator.serviceWorker.ready;
}

export function normalizeVirtualFilePath(rawVirtualFilePath: string) {
  const safePathValue = rawVirtualFilePath || "";
  const trimmedLeadingSlashes = safePathValue.replace(/^\/+/, "");
  return `/${trimmedLeadingSlashes}`;
}

export function determineMimeTypeForPath(virtualFilePath: string) {
  const filePath = virtualFilePath.toLowerCase();
  const extensionEntries = Object.entries(MIME_TYPE_BY_EXTENSION);

  for (const [extension, mimeType] of extensionEntries) {
    if (filePath.endsWith(extension)) {
      return mimeType;
    }
  }

  return "";
}

export async function createVirtualFileDescriptors(selectedFiles: File[]) {
  const virtualFileDescriptorPromises = selectedFiles.map(async (selectedFile) => {
    const relativePath =
      (selectedFile as File & { webkitRelativePath?: string }).webkitRelativePath ||
      selectedFile.name;

    const fileContent = await selectedFile.text();
    const mimeType = determineMimeTypeForPath(relativePath);

    return {
      path: relativePath,
      content: fileContent,
      type: mimeType,
    } satisfies VirtualFileDescriptor;
  });

  return Promise.all(virtualFileDescriptorPromises);
}

export function deriveJavaScriptFilePaths(virtualFileDescriptors: VirtualFileDescriptor[]) {
  const normalizedVirtualFilePaths = virtualFileDescriptors.map((virtualFileDescriptor) =>
    normalizeVirtualFilePath(virtualFileDescriptor.path),
  );

  return normalizedVirtualFilePaths
    .filter((virtualFilePath) => {
      if (virtualFilePath.endsWith(".js")) {
        return true;
      }

      return virtualFilePath.endsWith(".mjs");
    })
    .sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));
}

export function selectPreferredEntryFilePath(javaScriptFilePaths: string[]) {
  if (javaScriptFilePaths.length === 0) {
    return "";
  }

  const mainEntryMatch = javaScriptFilePaths.find((filePath) =>
    APPLICATION_CONSTANTS.mainEntryFilePattern.test(filePath),
  );
  if (mainEntryMatch) {
    return mainEntryMatch;
  }

  const indexEntryMatch = javaScriptFilePaths.find((filePath) =>
    APPLICATION_CONSTANTS.indexEntryFilePattern.test(filePath),
  );
  if (indexEntryMatch) {
    return indexEntryMatch;
  }

  return javaScriptFilePaths[0];
}

export function buildRunnerPageUrl(entryModuleUrl: string) {
  const encodedEntryUrl = encodeURIComponent(entryModuleUrl);
  return `${APPLICATION_CONSTANTS.runnerPagePath}?${APPLICATION_CONSTANTS.runnerEntryQueryParameter}=${encodedEntryUrl}`;
}

export function buildLoadedFilesStatusMessage(fileCount: number) {
  return `loaded ${fileCount} files`;
}

export function buildEntryNotReachableMessage(entryModuleUrl: string) {
  return `${APPLICATION_ERROR_MESSAGES.entryNotReachablePrefix}${entryModuleUrl}`;
}

export function buildServiceWorkerErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `${APPLICATION_ERROR_MESSAGES.serviceWorkerErrorPrefix}${error.message}`;
  }

  if (typeof error === "string") {
    return `${APPLICATION_ERROR_MESSAGES.serviceWorkerErrorPrefix}${error}`;
  }

  return `${APPLICATION_ERROR_MESSAGES.serviceWorkerErrorPrefix}${String(error)}`;
}

export class VirtualFileSession {
  public readonly sessionIdentifier = Math.random().toString(36).slice(2);
  private readonly virtualFileStore = new Map<string, VirtualFileDescriptor>();

  mount(virtualFileDescriptors: VirtualFileDescriptor[]) {
    this.virtualFileStore.clear();

    for (const virtualFileDescriptor of virtualFileDescriptors) {
      const normalizedVirtualFilePath = normalizeVirtualFilePath(virtualFileDescriptor.path);
      const normalizedVirtualFileDescriptor = {
        ...virtualFileDescriptor,
        path: normalizedVirtualFilePath,
      };
      this.virtualFileStore.set(normalizedVirtualFilePath, normalizedVirtualFileDescriptor);
    }

    const virtualFileBroadcastChannel = new BroadcastChannel(
      APPLICATION_CONSTANTS.broadcastChannelName,
    );
    virtualFileBroadcastChannel.postMessage({
      id: this.sessionIdentifier,
      files: Array.from(this.virtualFileStore.values()),
    });
    virtualFileBroadcastChannel.close();
  }

  getBasePath() {
    return `${APPLICATION_CONSTANTS.virtualNamespacePrefix}${this.sessionIdentifier}`;
  }

  buildFileUrl(relativeFilePath: string) {
    const sanitizedRelativeFilePath = relativeFilePath.replace(/^\/+/, "");
    return `${this.getBasePath()}/${sanitizedRelativeFilePath}`;
  }
}
