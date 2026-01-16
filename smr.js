import {
  connect as connectSerial,
  disconnect as disconnectSerial,
  claim,
  release,
  subscribe,
  getPreferredBaud,
  setPreferredBaud,
} from "./serial-manager.js";

const connectBtn = document.getElementById("smrConnect");
const disconnectBtn = document.getElementById("smrDisconnect");
const baudSelect = document.getElementById("smrBaudSelect");
const statusDot = document.getElementById("smrStatusDot");
const statusTitle = document.getElementById("smrStatusTitle");
const statusSubtitle = document.getElementById("smrStatusSubtitle");
const firmwareEl = document.getElementById("smrFirmware");
const errorEl = document.getElementById("smrError");
const errorTextEl = errorEl ? errorEl.querySelector(".status-error-text") : null;
const errorCloseBtn = errorEl ? errorEl.querySelector(".status-error-close") : null;
const logEl = document.getElementById("smsLog");
const clearBtn = document.getElementById("smsClear");
const inputEl = document.getElementById("smsInput");
const countEl = document.getElementById("smsCount");
const sendBtn = document.getElementById("smsSend");

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_SMS_LENGTH = 30;

let port = null;
let reader = null;
let isConnected = false;
let isAttached = false;
let isReading = false;
let isRefreshingFirmware = false;
let textBuffer = "";
let lastSent = null;
let lastSentAt = 0;
let lastSentEntry = null;

const setStatus = (connected, title, subtitle) => {
  if (statusDot) statusDot.dataset.status = connected ? "connected" : "disconnected";
  if (statusTitle) statusTitle.textContent = title;
  if (statusSubtitle) statusSubtitle.textContent = subtitle;
};

const setError = (message) => {
  if (!errorEl || !errorTextEl) return;
  if (!message) {
    errorEl.hidden = true;
    errorTextEl.textContent = "";
    return;
  }
  errorTextEl.textContent = message;
  errorEl.hidden = false;
};

if (errorCloseBtn) {
  const clearError = () => setError("");
  errorCloseBtn.addEventListener("click", clearError);
  errorCloseBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      clearError();
    }
  });
}

const updateControls = () => {
  if (connectBtn) connectBtn.disabled = isAttached;
  if (disconnectBtn) disconnectBtn.disabled = !isAttached;
  if (baudSelect) baudSelect.disabled = isConnected;
  if (sendBtn) sendBtn.disabled = !isAttached;
  if (inputEl) inputEl.disabled = !isAttached;
};

const updateCounter = () => {
  if (!inputEl || !countEl) return;
  const raw = inputEl.value || "";
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const remaining = Math.max(0, MAX_SMS_LENGTH - normalized.length);
  countEl.textContent = `${remaining} left`;
};

const appendMessage = (message, direction = "system", label = "SYS") => {
  if (!logEl) return;
  const entry = document.createElement("div");
  entry.className = "sms-entry";
  if (direction === "system") {
    entry.dataset.tone = "system";
  } else {
    entry.dataset.direction = direction;
  }

  const labelEl = document.createElement("span");
  labelEl.className = "sms-label";
  labelEl.textContent = label;

  const textEl = document.createElement("span");
  textEl.className = "sms-text";
  textEl.textContent = message || "";

  entry.append(labelEl, textEl);
  logEl.append(entry);
  logEl.scrollTop = logEl.scrollHeight;
  return entry;
};

const markLastSentReceived = (stationId = "") => {
  if (!lastSentEntry) return;
  lastSentEntry.classList.add("sms-ack");
  if (!lastSentEntry.querySelector(".sms-meta")) {
    const metaEl = document.createElement("span");
    metaEl.className = "sms-meta";
    metaEl.textContent = stationId || "OK";
    lastSentEntry.append(metaEl);
  }
};

const shouldSkipEcho = (message) => {
  if (!lastSent) return false;
  const isSame = message.trim() === lastSent;
  const within = Date.now() - lastSentAt < 2000;
  if (isSame && within) {
    lastSent = null;
    return true;
  }
  return false;
};

const handleLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (trimmed.startsWith("SVC<RCPT")) {
    const match = trimmed.match(/^SVC<RCPT\[(.+)\]$/);
    const stationId = match ? match[1].trim() : "";
    markLastSentReceived(stationId);
    return;
  }
  if (trimmed.startsWith("SMS[")) {
    const match = trimmed.match(/^SMS\[(.+?)\]\s*<\s*(.*)$/);
    if (match) {
      const stationId = match[1].trim();
      const message = match[2].trim();
      appendMessage(message, "in", stationId || "SMS<");
      return;
    }
  }
  if (trimmed.startsWith("SMS<")) {
    const message = trimmed.slice(4).trimStart();
    appendMessage(message, "in", "SMS<");
    return;
  }
  if (trimmed.startsWith("SMS>")) {
    const message = trimmed.slice(4).trimStart();
    if (shouldSkipEcho(message)) return;
    lastSentEntry = appendMessage(message, "out", "SMS>");
    return;
  }
  appendMessage(trimmed, "system", "SYS");
};

const flushLines = () => {
  let newlineIndex = textBuffer.indexOf("\n");
  while (newlineIndex !== -1) {
    let line = textBuffer.slice(0, newlineIndex);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    textBuffer = textBuffer.slice(newlineIndex + 1);
    handleLine(line);
    newlineIndex = textBuffer.indexOf("\n");
  }
};

const startReader = async () => {
  if (!port || !port.readable || isReading) return;
  reader = port.readable.getReader();
  isReading = true;
  try {
    while (isReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      textBuffer += decoder.decode(value, { stream: true });
      flushLines();
    }
  } catch (error) {
    if (isReading) {
      setError(`Serial read error: ${error.message || error}`);
    }
  } finally {
    isReading = false;
    if (reader) {
      try {
        reader.releaseLock();
      } catch {
        // Ignore release errors.
      }
    }
  }
};

const stopReader = async () => {
  isReading = false;
  if (reader) {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancel errors.
    }
  }
  reader = null;
};

const connectToDevice = async () => {
  if (!claim("smr")) {
    setError("Another tool is using the serial connection.");
    return;
  }
  setError("");
  try {
    const baudRate = baudSelect ? Number(baudSelect.value) : getPreferredBaud() || 115200;
    await connectSerial({ baudRate });
  } catch (error) {
    setError(`Failed to connect: ${error.message || error}`);
  } finally {
    release("smr");
  }
};

const disconnectFromDevice = async () => {
  if (!claim("smr")) {
    setError("Another tool is using the serial connection.");
    return;
  }
  setError("");
  try {
    await stopReader();
    await disconnectSerial();
  } catch (error) {
    setError(`Failed to disconnect: ${error.message || error}`);
  } finally {
    release("smr");
  }
};

const updateAttachment = () => {
  const shouldAttach = isConnected && isPageActive;
  if (shouldAttach === isAttached) {
    if (isAttached) {
      if (isRefreshingFirmware) {
        if (isReading) stopReader();
        setStatus(true, "Connected", "Reading firmware...");
      } else if (!isReading) {
        startReader();
        setStatus(true, "Connected", "Ready to exchange SMS frames.");
      }
    }
    updateControls();
    return;
  }
  isAttached = shouldAttach;
  if (isAttached) {
    textBuffer = "";
    if (isRefreshingFirmware) {
      setStatus(true, "Connected", "Reading firmware...");
    } else {
      startReader();
      setStatus(true, "Connected", "Ready to exchange SMS frames.");
    }
  } else {
    stopReader();
    setStatus(
      isConnected,
      isConnected ? "Connected" : "Disconnected",
      isConnected ? "SMR idle." : "No serial port selected.",
    );
  }
  updateControls();
};

const sendMessage = async () => {
  if (!port || !port.writable || !inputEl) return;
  const raw = inputEl.value.trim();
  if (!raw) return;
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.length > MAX_SMS_LENGTH) {
    setError(`Message must be ${MAX_SMS_LENGTH} characters or less.`);
    inputEl.focus();
    return;
  }
  setError("");
  const message = normalized.toUpperCase();
  const payload = `SMS:${message}\r\n`;
  const writer = port.writable.getWriter();
  try {
    await writer.write(encoder.encode(payload));
    lastSent = message;
    lastSentAt = Date.now();
    lastSentEntry = appendMessage(message, "out", "SMS>");
    inputEl.value = "";
    inputEl.focus();
    updateCounter();
  } catch (error) {
    setError(`Failed to send SMS: ${error.message || error}`);
  } finally {
    writer.releaseLock();
  }
};

const clearLog = () => {
  if (!logEl) return;
  logEl.textContent = "";
  lastSentEntry = null;
};

if (connectBtn) connectBtn.addEventListener("click", connectToDevice);
if (disconnectBtn) disconnectBtn.addEventListener("click", disconnectFromDevice);
if (sendBtn) sendBtn.addEventListener("click", sendMessage);
if (clearBtn) clearBtn.addEventListener("click", clearLog);
if (baudSelect) {
  const storedBaud = getPreferredBaud();
  if (storedBaud) baudSelect.value = String(storedBaud);
  baudSelect.addEventListener("change", () => {
    setPreferredBaud(Number(baudSelect.value));
  });
}
if (inputEl) {
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });
  inputEl.addEventListener("input", updateCounter);
}

let isPageActive = false;

window.addEventListener("spa:page", (event) => {
  isPageActive = event.detail && event.detail.pageId === "smr";
  updateAttachment();
});

subscribe((state) => {
  port = state.port;
  isConnected = state.connected;
  isRefreshingFirmware = state.refreshingFirmware;
  if (baudSelect && state.baudRate) {
    baudSelect.value = String(state.baudRate);
    setPreferredBaud(state.baudRate);
  }
  if (firmwareEl) {
    firmwareEl.textContent = state.firmwareVersion || "-";
  }
  updateAttachment();
});

updateControls();
updateCounter();
