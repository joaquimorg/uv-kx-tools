import { eepromInit, releaseIo } from "./protocol.js";

const state = {
  port: null,
  baudRate: null,
  connected: false,
  firmwareVersion: "-",
  refreshingFirmware: false,
  activeClient: null,
};

const listeners = new Set();
const BAUD_STORAGE_KEY = "uvk5-baud-rate";

const getPreferredBaud = () => {
  if (typeof localStorage === "undefined") return null;
  const stored = localStorage.getItem(BAUD_STORAGE_KEY);
  if (!stored) return null;
  const value = Number(stored);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
};

const setPreferredBaud = (baudRate) => {
  if (typeof localStorage === "undefined") return;
  if (!Number.isFinite(baudRate) || baudRate <= 0) return;
  localStorage.setItem(BAUD_STORAGE_KEY, String(baudRate));
};

const notify = () => {
  const snapshot = {
    connected: state.connected,
    baudRate: state.baudRate,
    firmwareVersion: state.firmwareVersion,
    refreshingFirmware: state.refreshingFirmware,
    activeClient: state.activeClient,
    port: state.port,
  };
  listeners.forEach((listener) => listener(snapshot));
};

const ensureSerialSupport = () => {
  if (!("serial" in navigator)) {
    throw new Error("Web Serial is not supported in this browser.");
  }
};

const requestPortIfNeeded = async () => {
  if (!state.port) {
    state.port = await navigator.serial.requestPort();
  }
  return state.port;
};

const ensurePortAvailable = (allowPrompt) => {
  if (state.port) return state.port;
  if (!allowPrompt) {
    throw new Error("Serial port not available without user gesture.");
  }
  return null;
};

const openPort = async (baudRate) => {
  if (!state.port) return null;
  if (state.port.readable && state.port.writable) return state.port;
  await state.port.open({ baudRate });
  return state.port;
};

const refreshFirmware = async () => {
  if (!state.port) return;
  state.refreshingFirmware = true;
  notify();
  try {
    const version = await eepromInit(state.port);
    state.firmwareVersion = version || "-";
  } catch {
    state.firmwareVersion = "-";
  } finally {
    state.refreshingFirmware = false;
    releaseIo("all");
    notify();
  }
};

const connect = async ({ baudRate = 115200, allowPrompt = true, skipFirmwareRefresh = false } = {}) => {
  ensureSerialSupport();
  if (state.connected && state.baudRate !== baudRate) {
    await disconnect();
  }
  const existingPort = ensurePortAvailable(allowPrompt);
  if (!existingPort) {
    await requestPortIfNeeded();
  }
  await openPort(baudRate);
  state.connected = true;
  state.baudRate = baudRate;
  setPreferredBaud(baudRate);
  if (!skipFirmwareRefresh) {
    await refreshFirmware();
  } else {
    state.firmwareVersion = "-";
    state.refreshingFirmware = false;
    notify();
  }
  return state.port;
};

const disconnect = async ({ keepPort = false } = {}) => {
  if (!state.port) {
    state.connected = false;
    state.baudRate = null;
    state.firmwareVersion = "-";
    state.refreshingFirmware = false;
    state.activeClient = null;
    notify();
    return;
  }
  releaseIo("all");
  try {
    await state.port.close();
  } catch {
    // Ignore close errors.
  }
  if (!keepPort) {
    state.port = null;
  }
  state.connected = false;
  state.baudRate = null;
  state.firmwareVersion = "-";
  state.refreshingFirmware = false;
  state.activeClient = null;
  notify();
};

const claim = (clientId) => {
  if (state.activeClient && state.activeClient !== clientId) {
    return false;
  }
  state.activeClient = clientId;
  notify();
  return true;
};

const release = (clientId) => {
  if (state.activeClient === clientId) {
    state.activeClient = null;
    notify();
  }
};

const getPort = () => state.port;

const getState = () => ({
  connected: state.connected,
  baudRate: state.baudRate,
  firmwareVersion: state.firmwareVersion,
  refreshingFirmware: state.refreshingFirmware,
  activeClient: state.activeClient,
  port: state.port,
});

const subscribe = (listener) => {
  listeners.add(listener);
  listener(getState());
  return () => listeners.delete(listener);
};

export {
  connect,
  disconnect,
  claim,
  release,
  getPort,
  getState,
  subscribe,
  getPreferredBaud,
  setPreferredBaud,
};
