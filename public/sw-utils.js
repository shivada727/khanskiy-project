export const SERVICE_WORKER_CONSTANTS = {
  broadcastChannelName: "vfs",
  virtualNamespacePrefix: "/virtual/",
  pingSegment: "__ping",
  listSegment: "__list",
  pingResponseBody: "ok",
  pingResponseContentType: "text/plain",
  listResponseContentType: "application/json",
  defaultIndexFileName: "index.js",
  defaultMimeType: "text/plain",
  sessionNotFoundMessage: "Session not found",
  notFoundMessagePrefix: "Not found: ",
};

export const CONTENT = 'Content-Type';

export const MIME_TYPE_BY_EXTENSION = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".html": "text/html",
};

export function determineMimeTypeFromPath(virtualFilePath) {
  const extensionEntries = Object.entries(MIME_TYPE_BY_EXTENSION);

  for (const [extension, mimeType] of extensionEntries) {
    if (virtualFilePath.endsWith(extension)) {
      return mimeType;
    }
  }

  return SERVICE_WORKER_CONSTANTS.defaultMimeType;
}

export function normalizeVirtualFilePath(rawVirtualFilePath) {
  const safePathValue = String(rawVirtualFilePath || "");

  const trimmedLeadingSlashes = safePathValue.replace(/^\/+/, "");

  return `/${trimmedLeadingSlashes}`;
}

export function createVirtualFileStoreMap(fileDescriptors) {
  const virtualFileStoreMap = new Map();

  if (!Array.isArray(fileDescriptors)) {
    return virtualFileStoreMap;
  }

  for (const fileDescriptor of fileDescriptors) {
    const normalizedVirtualFilePath = normalizeVirtualFilePath(
      fileDescriptor.path
    );

    virtualFileStoreMap.set(normalizedVirtualFilePath, fileDescriptor);
  }

  return virtualFileStoreMap;
}

export function isVirtualNamespacePath(pathname) {
  return pathname.startsWith(SERVICE_WORKER_CONSTANTS.virtualNamespacePrefix);
}

export function isPingRequest(pathSegments) {
  return (
    pathSegments.length === 1 &&
    pathSegments[0] === SERVICE_WORKER_CONSTANTS.pingSegment
  );
}

export function isListRequest(pathSegments) {
  return (
    pathSegments.length === 1 &&
    pathSegments[0] === SERVICE_WORKER_CONSTANTS.listSegment
  );
}

export function buildNotFoundMessage(virtualFilePath) {
  return `${SERVICE_WORKER_CONSTANTS.notFoundMessagePrefix}${virtualFilePath}`;
}


