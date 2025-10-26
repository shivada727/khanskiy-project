import { useEffect, useRef, useState, type ChangeEventHandler } from "react";
import {
  APPLICATION_CONSTANTS,
  APPLICATION_ERROR_MESSAGES,
  APPLICATION_LOG_MESSAGES,
  APPLICATION_STATUS_MESSAGES,
  VirtualFileSession,
  buildEntryNotReachableMessage,
  buildLoadedFilesStatusMessage,
  buildRunnerPageUrl,
  buildServiceWorkerErrorMessage,
  createVirtualFileDescriptors,
  deriveJavaScriptFilePaths,
  ensureServiceWorkerReady,
  selectPreferredEntryFilePath,
  type DirectoryInputElement,
} from "./app-utils";

export default function App() {
  const [virtualFileSession, setVirtualFileSession] =
    useState<VirtualFileSession | null>(null);
  const [javaScriptFilePaths, setJavaScriptFilePaths] = useState<string[]>([]);
  const [entryFilePath, setEntryFilePath] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>(
    APPLICATION_STATUS_MESSAGES.idle
  );
  const runnerIframeReference = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    ensureServiceWorkerReady().catch((serviceWorkerError) => {
      setStatusMessage(buildServiceWorkerErrorMessage(serviceWorkerError));
    });
  }, []);

  const handleDirectorySelection: ChangeEventHandler<HTMLInputElement> = async (
    directoryInputChangeEvent
  ) => {
    const selectedFileList = Array.from(
      directoryInputChangeEvent.target.files ?? []
    );

    if (selectedFileList.length === 0) {
      return;
    }

    setStatusMessage(APPLICATION_STATUS_MESSAGES.readingFiles);

    const updatedVirtualFileSession = new VirtualFileSession();
    
    const virtualFileDescriptors = await createVirtualFileDescriptors(
      selectedFileList
    );

    updatedVirtualFileSession.mount(virtualFileDescriptors);

    setVirtualFileSession(updatedVirtualFileSession);

    const discoveredJavaScriptFilePaths = deriveJavaScriptFilePaths(
      virtualFileDescriptors
    );

    const preferredEntryFilePath = selectPreferredEntryFilePath(
      discoveredJavaScriptFilePaths
    );

    setJavaScriptFilePaths(discoveredJavaScriptFilePaths);
    setEntryFilePath(preferredEntryFilePath);
    setStatusMessage(
      buildLoadedFilesStatusMessage(virtualFileDescriptors.length)
    );
  };

  const handleEntrySelection: ChangeEventHandler<HTMLSelectElement> = (
    entrySelectChangeEvent
  ) => {
    setEntryFilePath(entrySelectChangeEvent.target.value);
  };

  const executeRunner = async () => {
    if (!virtualFileSession) {
      return;
    }

    if (!entryFilePath) {
      return;
    }

    const runnerIframeElement = runnerIframeReference.current;
    if (!runnerIframeElement) {
      return;
    }

    const absoluteEntryModuleUrl = new URL(
      virtualFileSession.buildFileUrl(entryFilePath),
      window.location.origin
    ).href;

    const serviceWorkerPingResponse = await fetch(
      `${window.location.origin}${virtualFileSession.getBasePath()}/__ping`
    )
      .then((pingResponse) => pingResponse.text())
      .catch(() => null);

    if (
      serviceWorkerPingResponse !==
      APPLICATION_CONSTANTS.serviceWorkerPingSuccessValue
    ) {
      setStatusMessage(APPLICATION_ERROR_MESSAGES.serviceWorkerPingFailure);
      return;
    }

    const virtualFileListing = await fetch(
      `${window.location.origin}${virtualFileSession.getBasePath()}/__list`
    )
      .then((listingResponse) => listingResponse.json())
      .catch(() => null);
    console.log(
      APPLICATION_LOG_MESSAGES.virtualFileListPrefix,
      virtualFileListing
    );

    const entryModuleResponse = await fetch(absoluteEntryModuleUrl, {
      cache: "no-store",
    }).catch(() => null);
    if (!entryModuleResponse || !entryModuleResponse.ok) {
      setStatusMessage(buildEntryNotReachableMessage(absoluteEntryModuleUrl));
      return;
    }

    setStatusMessage(APPLICATION_STATUS_MESSAGES.running);

    const runnerPageUrl = buildRunnerPageUrl(absoluteEntryModuleUrl);
    runnerIframeElement.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin"
    );
    runnerIframeElement.src = runnerPageUrl;
  };

  const DirectoryInput = (directoryInputProps: DirectoryInputElement) => (
    <input {...directoryInputProps} />
  );

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        maxWidth: 960,
        margin: "24px auto",
        padding: "0 16px",
      }}
    >
      <h2 style={{ margin: 0 }}>Browser ESM Runner</h2>
      <small style={{ opacity: 0.7 }}>{statusMessage}</small>

      <DirectoryInput
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        onChange={handleDirectorySelection}
        style={{ maxWidth: 420 }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ minWidth: 60 }}>Entry:</label>
        <select
          value={entryFilePath}
          onChange={handleEntrySelection}
          disabled={javaScriptFilePaths.length === 0}
          style={{ flex: 1, padding: 6 }}
        >
          {javaScriptFilePaths.map((javaScriptFilePath) => (
            <option key={javaScriptFilePath} value={javaScriptFilePath}>
              {javaScriptFilePath}
            </option>
          ))}
        </select>
        <button
          onClick={executeRunner}
          disabled={!entryFilePath}
          style={{ padding: "8px 12px" }}
        >
          Start
        </button>
      </div>

      <iframe
        ref={runnerIframeReference}
        style={{
          width: "100%",
          height: "60vh",
          border: "1px solid #ddd",
          borderRadius: 10,
          background: "white",
        }}
      />
    </div>
  );
}
