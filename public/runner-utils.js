const RUNNER_CONSTANTS = Object.freeze({
  logContainerElementIdentifier: "log",
  consoleMethodNames: Object.freeze(["log", "info", "warn", "error"]),
  entryQueryParameterKey: "entry",
  missingEntryMessage: "No entry provided",
  entryLogPrefix: "entry:",
  entryNotReadyMessage:
    "Entry not ready (no 200 JS). Check SW mounting and paths.",
  entryImportFailedMessage: "Import failed:",
  errorEventPrefix: "Error event:",
  unhandledRejectionPrefix: "Unhandled:",
  expectedContentTypeKeyword: "javascript",
  waitAttemptCount: 30,
  waitDelayMilliseconds: 150,
  fetchOptions: Object.freeze({ cache: "no-store" }),
});

function findLogContainerElement(documentReference) {
  return documentReference.getElementById(
    RUNNER_CONSTANTS.logContainerElementIdentifier
  );
}

function formatLogValue(logValue) {
  if (logValue instanceof Error) {
    const errorStackTrace = logValue.stack || "";
    return `${logValue.name}: ${logValue.message}\n${errorStackTrace}`;
  }

  if (logValue === null) {
    return "null";
  }

  if (typeof logValue === "object") {
    try {
      return JSON.stringify(logValue, null, 2);
    } catch (jsonStringifyError) {
      return String(logValue);
    }
  }

  return String(logValue);
}

function appendLogEntry(logContainerElement, logLevelKey, ...logValues) {
  if (!logContainerElement) {
    return;
  }

  const formattedLogValues = logValues.map((logValue) =>
    formatLogValue(logValue)
  );
  const appendedLogLine = `[${logLevelKey}] ${formattedLogValues.join(" ")}\n`;
  logContainerElement.textContent += appendedLogLine;
}

function overrideConsoleMethods(logContainerElement) {
  for (const consoleMethodName of RUNNER_CONSTANTS.consoleMethodNames) {
    const originalConsoleMethod = console[consoleMethodName].bind(console);

    console[consoleMethodName] = (...consoleArguments) => {
      originalConsoleMethod(...consoleArguments);
      appendLogEntry(
        logContainerElement,
        consoleMethodName,
        ...consoleArguments
      );
    };
  }
}

function registerGlobalErrorListeners(logContainerElement) {
  self.addEventListener("error", (errorEvent) => {
    appendLogEntry(
      logContainerElement,
      "error",
      RUNNER_CONSTANTS.errorEventPrefix,
      errorEvent.message,
      errorEvent.error || ""
    );
  });

  self.addEventListener("unhandledrejection", (unhandledRejectionEvent) => {
    appendLogEntry(
      logContainerElement,
      "error",
      RUNNER_CONSTANTS.unhandledRejectionPrefix,
      unhandledRejectionEvent.reason || ""
    );
  });
}

function extractEntryModuleUrl(searchParametersString) {
  const urlSearchParameters = new URLSearchParams(searchParametersString);

  return urlSearchParameters.get(RUNNER_CONSTANTS.entryQueryParameterKey);
}

function isSuccessfulJavaScriptResponse(response) {
  if (!response) {
    return false;
  }

  const contentTypeHeaderValue = response.headers.get("content-type") || "";
  
  return (
    response.ok &&
    contentTypeHeaderValue.includes(RUNNER_CONSTANTS.expectedContentTypeKeyword)
  );
}

async function waitForEntryModule(entryModuleUrl) {
  for (
    let attemptIndex = 0;
    attemptIndex < RUNNER_CONSTANTS.waitAttemptCount;
    attemptIndex += 1
  ) {
    try {
      const fetchedResponse = await fetch(
        entryModuleUrl,
        RUNNER_CONSTANTS.fetchOptions
      );

      if (isSuccessfulJavaScriptResponse(fetchedResponse)) {
        return true;
      }
    } catch (fetchError) {}

    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, RUNNER_CONSTANTS.waitDelayMilliseconds)
    );
  }

  return false;
}

self.RunnerUtilities = Object.freeze({
  RUNNER_CONSTANTS,
  findLogContainerElement,
  formatLogValue,
  appendLogEntry,
  overrideConsoleMethods,
  registerGlobalErrorListeners,
  extractEntryModuleUrl,
  waitForEntryModule,
});
