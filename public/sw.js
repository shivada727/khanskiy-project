import {
  SERVICE_WORKER_CONSTANTS,
  determineMimeTypeFromPath,
  createVirtualFileStoreMap,
  isVirtualNamespacePath,
  isPingRequest,
  isListRequest,
  buildNotFoundMessage,
} from "./sw-utils";

self.addEventListener("install", (installEvent) => self.skipWaiting());

self.addEventListener("activate", (activationEvent) =>
  activationEvent.waitUntil(self.clients.claim())
);

const virtualFileSessions = new Map();

const virtualFileSystemBroadcastChannel = new BroadcastChannel(
  SERVICE_WORKER_CONSTANTS.broadcastChannelName
);

virtualFileSystemBroadcastChannel.onmessage = (messageEvent) => {
  const eventData = messageEvent.data || {};

  const { id: virtualFileSessionIdentifier, files: virtualFileDescriptors } =
    eventData;

  if (!virtualFileSessionIdentifier) {
    return;
  }

  if (!Array.isArray(virtualFileDescriptors)) {
    return;
  }

  if (virtualFileDescriptors.length === 0) {
    return;
  }

  const virtualFileStore = createVirtualFileStoreMap(virtualFileDescriptors);

  virtualFileSessions.set(virtualFileSessionIdentifier, virtualFileStore);
};

self.addEventListener("fetch", (fetchEvent) => {
  const requestUniformResourceLocator = new URL(fetchEvent.request.url);

  if (!isVirtualNamespacePath(requestUniformResourceLocator.pathname)) {
    return;
  }

  fetchEvent.respondWith(handleVirtualRequest(requestUniformResourceLocator));
});

function createPingResponse() {
  return new Response(SERVICE_WORKER_CONSTANTS.pingResponseBody, {
    status: 200,
    headers: {
      "Content-Type": SERVICE_WORKER_CONSTANTS.pingResponseContentType,
    },
  });
}

function createListResponse(virtualFileSessionIdentifier, virtualFileStore) {
  const availableFilePaths = virtualFileStore
    ? Array.from(virtualFileStore.keys())
    : [];

  const responsePayload = {
    id: virtualFileSessionIdentifier,
    count: availableFilePaths.length,
    keys: availableFilePaths,
  };

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: {
      "Content-Type": SERVICE_WORKER_CONSTANTS.listResponseContentType,
    },
  });
}

function createSessionNotFoundResponse() {
  return new Response(SERVICE_WORKER_CONSTANTS.sessionNotFoundMessage, {
    status: 404,
  });
}

function buildRequestedVirtualFilePath(virtualFilePathSegments) {
  const joinedVirtualFilePath = `/${virtualFilePathSegments.join("/")}`;

  if (!joinedVirtualFilePath.endsWith("/")) {
    return joinedVirtualFilePath;
  }

  return `${joinedVirtualFilePath}${SERVICE_WORKER_CONSTANTS.defaultIndexFileName}`;
}

function handleVirtualRequest(requestUniformResourceLocator) {
  const pathnameSegments = requestUniformResourceLocator.pathname.split("/");

  const virtualFileSessionIdentifier = pathnameSegments[2];

  const virtualFilePathSegments = pathnameSegments.slice(3);

  if (!virtualFileSessionIdentifier) {
    return createSessionNotFoundResponse();
  }

  if (isPingRequest(virtualFilePathSegments)) {
    return createPingResponse();
  }

  const virtualFileStore = virtualFileSessions.get(
    virtualFileSessionIdentifier
  );

  if (isListRequest(virtualFilePathSegments)) {
    return createListResponse(virtualFileSessionIdentifier, virtualFileStore);
  }

  if (!virtualFileStore) {
    return createSessionNotFoundResponse();
  }

  const requestedVirtualFilePath = buildRequestedVirtualFilePath(
    virtualFilePathSegments
  );
  
  const candidateVirtualFilePaths = [
    requestedVirtualFilePath,
    `${requestedVirtualFilePath}.js`,
  ];

  for (const candidateVirtualFilePath of candidateVirtualFilePaths) {
    const virtualFileDescriptor = virtualFileStore.get(
      candidateVirtualFilePath
    );

    if (!virtualFileDescriptor) {
      continue;
    }

    const responseContentType =
      virtualFileDescriptor.type ||
      determineMimeTypeFromPath(candidateVirtualFilePath);

    return new Response(virtualFileDescriptor.content, {
      status: 200,
      headers: { "Content-Type": responseContentType },
    });
  }

  return new Response(buildNotFoundMessage(requestedVirtualFilePath), {
    status: 404,
  });
}
