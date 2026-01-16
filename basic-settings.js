import {
  eepromInit,
  eepromRead,
  eepromWrite,
  eepromReboot,
} from "./protocol.js";
import {
  connect as connectSerial,
  disconnect as disconnectSerial,
  claim,
  release,
  getPort,
  subscribe,
  getPreferredBaud,
  setPreferredBaud,
} from "./serial-manager.js";

const readSettingsBtn = document.getElementById("readSettingsBtn");
const writeSettingsBtn = document.getElementById("writeSettingsBtn");
const settingsStatus = document.getElementById("settingsStatus");
const settingsFill = document.getElementById("settingsFill");
const settingsPct = document.getElementById("settingsPct");
const settingsModal = document.getElementById("settingsModal");
const settingsModalTitle = document.getElementById("settingsModalTitle");
const settingsModalMessage = document.getElementById("settingsModalMessage");
const settingsModalFill = document.getElementById("settingsModalFill");
const settingsModalPct = document.getElementById("settingsModalPct");
const settingsPanel = document.getElementById("settingsPanel");
const connectBtn = document.getElementById("settingsConnect");
const disconnectBtn = document.getElementById("settingsDisconnect");
const baudSelect = document.getElementById("settingsBaudSelect");
const connectionDot = document.getElementById("settingsStatusDot");
const connectionLabel = document.getElementById("settingsStatusLabel");
const deviceInfo = document.getElementById("settingsDeviceInfo");
const firmwareEl = document.getElementById("settingsFirmware");
const errorEl = document.getElementById("settingsError");
const errorTextEl = errorEl ? errorEl.querySelector(".status-error-text") : null;
const errorCloseBtn = errorEl ? errorEl.querySelector(".status-error-close") : null;

const SET_LOW_LIST = ["< 20mW", "125mW", "250mW", "500mW", "1W", "2W", "5W"];
const SET_PTT_LIST = ["CLASSIC", "ONEPUSH"];
const SET_TOT_EOT_LIST = ["OFF", "SOUND", "VISUAL", "ALL"];
const SET_OFF_ON_LIST = ["OFF", "ON"];
const SET_LCK_LIST = ["KEYS", "KEYS+PTT"];
const SET_MET_LIST = ["TINY", "CLASSIC"];
const SET_NFM_LIST = ["NARROW", "NARROWER"];
const RXMODE_LIST = ["MAIN ONLY", "DUAL RX RESPOND", "CROSS BAND", "MAIN TX DUAL RX"];
const BAT_TXT_LIST = ["NONE", "VOLTAGE", "PERCENT"];
const SET_OFF_TMR_LIST = ["OFF"];
for (let h = 0; h < 2; h += 1) {
  if (h === 1) {
    SET_OFF_TMR_LIST.push(`${h}h:00m`);
  }
  for (let m = 1; m < 60; m += 1) {
    SET_OFF_TMR_LIST.push(`${h}h:${String(m).padStart(2, "0")}m`);
  }
}
SET_OFF_TMR_LIST.push("2h:00m");
const BACKLIGHT_LIST = [
  "OFF",
  "5 sec",
  "10 sec",
  "15 sec",
  "20 sec",
  "25 sec",
  "30 sec",
  "35 sec",
  "40 sec",
  "45 sec",
  "50 sec",
  "55 sec",
  "1 min",
  "1 min : 5 sec",
  "1 min : 10 sec",
  "1 min : 15 sec",
  "1 min : 20 sec",
  "1 min : 25 sec",
  "1 min : 30 sec",
  "1 min : 35 sec",
  "1 min : 40 sec",
  "1 min : 45 sec",
  "1 min : 50 sec",
  "1 min : 55 sec",
  "2 min",
  "2 min : 5 sec",
  "2 min : 10 sec",
  "2 min : 15 sec",
  "2 min : 20 sec",
  "2 min : 25 sec",
  "2 min : 30 sec",
  "2 min : 35 sec",
  "2 min : 40 sec",
  "2 min : 45 sec",
  "2 min : 50 sec",
  "2 min : 55 sec",
  "3 min",
  "3 min : 5 sec",
  "3 min : 10 sec",
  "3 min : 15 sec",
  "3 min : 20 sec",
  "3 min : 25 sec",
  "3 min : 30 sec",
  "3 min : 35 sec",
  "3 min : 40 sec",
  "3 min : 45 sec",
  "3 min : 50 sec",
  "3 min : 55 sec",
  "4 min",
  "4 min : 5 sec",
  "4 min : 10 sec",
  "4 min : 15 sec",
  "4 min : 20 sec",
  "4 min : 25 sec",
  "4 min : 30 sec",
  "4 min : 35 sec",
  "4 min : 40 sec",
  "4 min : 45 sec",
  "4 min : 50 sec",
  "4 min : 55 sec",
  "5 min",
  "Always On (ON)",
];
const BACKLIGHT_LVL_LIST = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const BACKLIGHT_TX_RX_LIST = ["OFF", "TX", "RX", "TX/RX"];
const TALK_TIME_LIST = [
  "N/U",
  "N/U",
  "N/U",
  "N/U",
  "N/U",
  "30 sec",
  "35 sec",
  "40 sec",
  "45 sec",
  "50 sec",
  "55 sec",
  "1 min",
  "1 min : 5 sec",
  "1 min : 10 sec",
  "1 min : 15 sec",
  "1 min : 20 sec",
  "1 min : 25 sec",
  "1 min : 30 sec",
  "1 min : 35 sec",
  "1 min : 40 sec",
  "1 min : 45 sec",
  "1 min : 50 sec",
  "1 min : 55 sec",
  "2 min",
  "2 min : 5 sec",
  "2 min : 10 sec",
  "2 min : 15 sec",
  "2 min : 20 sec",
  "2 min : 25 sec",
  "2 min : 30 sec",
  "2 min : 35 sec",
  "2 min : 40 sec",
  "2 min : 45 sec",
  "2 min : 50 sec",
  "2 min : 55 sec",
  "3 min",
  "3 min : 5 sec",
  "3 min : 10 sec",
  "3 min : 15 sec",
  "3 min : 20 sec",
  "3 min : 25 sec",
  "3 min : 30 sec",
  "3 min : 35 sec",
  "3 min : 40 sec",
  "3 min : 45 sec",
  "3 min : 50 sec",
  "3 min : 55 sec",
  "4 min",
  "4 min : 5 sec",
  "4 min : 10 sec",
  "4 min : 15 sec",
  "4 min : 20 sec",
  "4 min : 25 sec",
  "4 min : 30 sec",
  "4 min : 35 sec",
  "4 min : 40 sec",
  "4 min : 45 sec",
  "4 min : 50 sec",
  "4 min : 55 sec",
  "5 min",
  "5 min : 5 sec",
  "5 min : 10 sec",
  "5 min : 15 sec",
  "5 min : 20 sec",
  "5 min : 25 sec",
  "5 min : 30 sec",
  "5 min : 35 sec",
  "5 min : 40 sec",
  "5 min : 45 sec",
  "5 min : 50 sec",
  "5 min : 55 sec",
  "6 min",
  "6 min : 5 sec",
  "6 min : 10 sec",
  "6 min : 15 sec",
  "6 min : 20 sec",
  "6 min : 25 sec",
  "6 min : 30 sec",
  "6 min : 35 sec",
  "6 min : 40 sec",
  "6 min : 45 sec",
  "6 min : 50 sec",
  "6 min : 55 sec",
  "7 min",
  "7 min : 5 sec",
  "7 min : 10 sec",
  "7 min : 15 sec",
  "7 min : 20 sec",
  "7 min : 25 sec",
  "7 min : 30 sec",
  "7 min : 35 sec",
  "7 min : 40 sec",
  "7 min : 45 sec",
  "7 min : 50 sec",
  "7 min : 55 sec",
  "8 min",
  "8 min : 5 sec",
  "8 min : 10 sec",
  "8 min : 15 sec",
  "8 min : 20 sec",
  "8 min : 25 sec",
  "8 min : 30 sec",
  "8 min : 35 sec",
  "8 min : 40 sec",
  "8 min : 45 sec",
  "8 min : 50 sec",
  "8 min : 55 sec",
  "9 min",
  "9 min : 5 sec",
  "9 min : 10 sec",
  "9 min : 15 sec",
  "9 min : 20 sec",
  "9 min : 25 sec",
  "9 min : 30 sec",
  "9 min : 35 sec",
  "9 min : 40 sec",
  "9 min : 45 sec",
  "9 min : 50 sec",
  "9 min : 55 sec",
  "10 min",
  "10 min : 5 sec",
  "10 min : 10 sec",
  "10 min : 15 sec",
  "10 min : 20 sec",
  "10 min : 25 sec",
  "10 min : 30 sec",
  "10 min : 35 sec",
  "10 min : 40 sec",
  "10 min : 45 sec",
  "10 min : 50 sec",
  "10 min : 55 sec",
  "11 min",
  "11 min : 5 sec",
  "11 min : 10 sec",
  "11 min : 15 sec",
  "11 min : 20 sec",
  "11 min : 25 sec",
  "11 min : 30 sec",
  "11 min : 35 sec",
  "11 min : 40 sec",
  "11 min : 45 sec",
  "11 min : 50 sec",
  "11 min : 55 sec",
  "12 min",
  "12 min : 5 sec",
  "12 min : 10 sec",
  "12 min : 15 sec",
  "12 min : 20 sec",
  "12 min : 25 sec",
  "12 min : 30 sec",
  "12 min : 35 sec",
  "12 min : 40 sec",
  "12 min : 45 sec",
  "12 min : 50 sec",
  "12 min : 55 sec",
  "13 min",
  "13 min : 5 sec",
  "13 min : 10 sec",
  "13 min : 15 sec",
  "13 min : 20 sec",
  "13 min : 25 sec",
  "13 min : 30 sec",
  "13 min : 35 sec",
  "13 min : 40 sec",
  "13 min : 45 sec",
  "13 min : 50 sec",
  "13 min : 55 sec",
  "14 min",
  "14 min : 5 sec",
  "14 min : 10 sec",
  "14 min : 15 sec",
  "14 min : 20 sec",
  "14 min : 25 sec",
  "14 min : 30 sec",
  "14 min : 35 sec",
  "14 min : 40 sec",
  "14 min : 45 sec",
  "14 min : 50 sec",
  "14 min : 55 sec",
  "15 min",
];
const BATSAVE_LIST = ["OFF", "1:1", "1:2", "1:3", "1:4", "1:5"];
const CHANNELDISP_LIST = [
  "Frequency (FREQ)",
  "CHANNEL NUMBER",
  "NAME",
  "Name + Frequency (NAME + FREQ)",
];
const MIC_GAIN_LIST = ["+1.1dB", "+4.0dB", "+8.0dB", "+12.0dB", "+15.1dB"];
const VOX_LIST = ["OFF", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const ROGER_LIST = ["OFF", "Roger beep (ROGER)", "MDC data burst (MDC)"];
const RTE_LIST = [
  "OFF",
  "100ms",
  "200ms",
  "300ms",
  "400ms",
  "500ms",
  "600ms",
  "700ms",
  "800ms",
  "900ms",
  "1000ms",
];
const VOICE_LIST = ["OFF", "Chinese", "English"];
const WELCOME_LIST = [
  "Message line 1, Voltage, Sound (ALL)",
  "Make 2 short sounds (SOUND)",
  "User message line 1 and line 2 (MESSAGE)",
  "Battery voltage (VOLTAGE)",
  "NONE",
];
const TX_VFO_LIST = ["A", "B"];
const BATTYPE_LIST = ["1600 mAh K5", "2200 mAh K5", "3500 mAh K5", "1400 mAh K1", "2500 mAh K1"];

const AUTO_KEYPAD_LOCK_LIST = ["OFF"];
for (let s = 0; s <= 10; s += 1) {
  for (const ms of ["00s", "15s", "30s", "45s"]) {
    if (s === 0 && ms === "00s") continue;
    AUTO_KEYPAD_LOCK_LIST.push(`${String(s).padStart(2, "0")}m:${ms}`);
  }
}

const SCANRESUME_LIST = ["STOP : Stop scan when a signal is received"];
for (let s = 0; s < 20; s += 1) {
  const msList = s === 0 ? ["250ms", "500ms", "750ms"] : ["000ms", "250ms", "500ms", "750ms"];
  for (const ms of msList) {
    SCANRESUME_LIST.push(
      `CARRIER ${String(s).padStart(2, "0")}s:${ms} : Listen for this time until the signal disappears`
    );
  }
}
SCANRESUME_LIST.push("CARRIER 20s:000ms : Listen for this time until the signal disappears");
for (let m = 5; m <= 120; m += 5) {
  const minutes = Math.floor(m / 60);
  const seconds = m % 60;
  SCANRESUME_LIST.push(
    `TIMEOUT ${String(minutes).padStart(2, "0")}m:${String(seconds).padStart(2, "0")}s : Listen for this time and resume`
  );
}

const SETTINGS_SELECTS = {
  setPwr: SET_LOW_LIST,
  setPtt: SET_PTT_LIST,
  setTot: SET_TOT_EOT_LIST,
  setEot: SET_TOT_EOT_LIST,
  setContrast: Array.from({ length: 16 }, (_, i) => `${i}`),
  setInv: SET_OFF_ON_LIST,
  setLck: SET_LCK_LIST,
  setMet: SET_MET_LIST,
  setGui: SET_MET_LIST,
  setTmr: SET_OFF_ON_LIST,
  setOff: SET_OFF_TMR_LIST,
  setNfm: SET_NFM_LIST,
  squelch: Array.from({ length: 10 }, (_, i) => `${i}`),
  rxMode: RXMODE_LIST,
  callChannel: Array.from({ length: 200 }, (_, i) => `Channel M${i + 1}`),
  autoKeypad: AUTO_KEYPAD_LOCK_LIST,
  txTimeout: TALK_TIME_LIST,
  batSave: BATSAVE_LIST,
  scanResume: SCANRESUME_LIST,
  amFix: SET_OFF_ON_LIST,
  batText: BAT_TXT_LIST,
  micBar: SET_OFF_ON_LIST,
  chDisp: CHANNELDISP_LIST,
  pOnMsg: WELCOME_LIST,
  backlightTime: BACKLIGHT_LIST,
  blMin: BACKLIGHT_LVL_LIST,
  blMax: BACKLIGHT_LVL_LIST,
  blTxRx: BACKLIGHT_TX_RX_LIST,
  micGain: MIC_GAIN_LIST,
  beep: SET_OFF_ON_LIST,
  roger: ROGER_LIST,
  ste: SET_OFF_ON_LIST,
  rpSte: RTE_LIST,
  txVfo: TX_VFO_LIST,
  keypadLock: SET_OFF_ON_LIST,
  batteryType: BATTYPE_LIST,
};

let canEdit = false;
let isConnected = false;
let isBusy = false;

const setStatus = (message, tone = "info") => {
  settingsStatus.textContent = message;
  settingsStatus.classList.toggle("status-error", tone === "error");
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

const setConnected = (connected) => {
  if (connectBtn) connectBtn.disabled = connected;
  if (disconnectBtn) disconnectBtn.disabled = !connected;
  if (baudSelect) baudSelect.disabled = connected;
};

const updateDeviceInfo = (port) => {
  if (!deviceInfo) return;
  if (!port) {
    deviceInfo.textContent = "No serial port selected.";
    return;
  }
  const info = port.getInfo ? port.getInfo() : {};
  const details = [];
  if (info.usbVendorId) details.push(`VID ${info.usbVendorId.toString(16)}`);
  if (info.usbProductId) details.push(`PID ${info.usbProductId.toString(16)}`);
  deviceInfo.textContent = details.length
    ? `Active port (${details.join(" / ")})`
    : "Serial port ready.";
};

const connectToDevice = async () => {
  if (!claim("settings")) {
    setError("Another tool is using the serial connection.");
    setStatus("Another tool is using the serial connection.", "error");
    return;
  }
  setError("");
  try {
    const baudRate = baudSelect ? Number(baudSelect.value) : getPreferredBaud() || 115200;
    await connectSerial({ baudRate });
    setError("");
    setStatus("Connected.");
  } catch (error) {
    const message = `Failed to connect: ${error.message || error}`;
    setError(message);
    setStatus(message, "error");
  } finally {
    release("settings");
  }
};

const disconnectFromDevice = async () => {
  if (!claim("settings")) {
    setError("Another tool is using the serial connection.");
    setStatus("Another tool is using the serial connection.", "error");
    return;
  }
  setError("");
  try {
    await disconnectSerial();
    setError("");
    setStatus("Disconnected.");
  } catch (error) {
    const message = `Failed to disconnect: ${error.message || error}`;
    setError(message);
    setStatus(message, "error");
  } finally {
    release("settings");
  }
};

const setProgress = (value, visible = true) => {
  const pct = Math.max(0, Math.min(100, value));
  const container = settingsFill.closest(".progress");
  if (container) container.classList.toggle("active", visible);
  settingsFill.style.width = `${pct}%`;
  settingsPct.textContent = `${pct.toFixed(1)}%`;
  settingsModalFill.style.width = `${pct}%`;
  settingsModalPct.textContent = `${pct.toFixed(1)}%`;
};

const showModal = (title, message) => {
  settingsModalTitle.textContent = title;
  settingsModalMessage.textContent = message;
  settingsModal.classList.add("active");
  settingsModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
};

const hideModal = () => {
  settingsModal.classList.remove("active");
  settingsModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
};

const updateActionState = () => {
  readSettingsBtn.disabled = isBusy || !isConnected;
  writeSettingsBtn.disabled = isBusy || !isConnected || !canEdit;
};

const disableActions = (disabled) => {
  isBusy = disabled;
  updateActionState();
};

const setEditEnabled = (enabled) => {
  canEdit = enabled;
  updateActionState();
  writeSettingsBtn.classList.toggle("is-disabled", !enabled || !isConnected);
  const controls = document.querySelectorAll(".settings-fields select, .settings-fields input");
  controls.forEach((control) => {
    control.disabled = !enabled || !isConnected;
  });
  if (settingsPanel) {
    settingsPanel.classList.toggle("is-locked", !enabled || !isConnected);
  }
};

const fillSelect = (id, options) => {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = options.map((value) => `<option value="${value}">${value}</option>`).join("");
};

Object.entries(SETTINGS_SELECTS).forEach(([id, options]) => fillSelect(id, options));
setTimeout(() => setEditEnabled(false), 0);

const getSelectValue = (id, list) => {
  const select = document.getElementById(id);
  if (!select) return 0;
  const index = list.indexOf(select.value);
  return index < 0 ? 0 : index;
};

const setSelectValue = (id, list, index) => {
  const select = document.getElementById(id);
  if (!select) return;
  const safeIndex = index >= 0 && index < list.length ? index : 0;
  select.value = list[safeIndex];
};


const readRange = async (start, length) => {
  const buffer = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += 0x80) {
    const size = Math.min(0x80, length - offset);
    const data = await eepromRead(getPort(), start + offset, size);
    buffer.set(data.slice(0, size), offset);
  }
  return buffer;
};

const writeRange = async (start, data) => {
  for (let offset = 0; offset < data.length; offset += 0x40) {
    const chunk = data.slice(offset, offset + 0x40);
    await eepromWrite(getPort(), start + offset, chunk, chunk.length);
  }
};

const readSettings = async () => {
  if (!isConnected) {
    setStatus("Connect the radio first.", "error");
    return;
  }
  if (!claim("settings")) {
    setStatus("Another tool is using the serial connection.", "error");
    return;
  }
  const port = getPort();
  if (!port) {
    setStatus("No serial port available.", "error");
    release("settings");
    return;
  }
  disableActions(true);
  setEditEnabled(false);
  setProgress(0, true);
  setStatus("Reading settings...");
  showModal("Reading settings", "Please keep the radio connected.");

  try {
    await eepromInit(port);

    const blockE70 = await readRange(0x0e70, 0x20);
    const blockE80 = await readRange(0x0e80, 0x10);
    const blockE90 = await readRange(0x0e90, 0x10);
    const blockEA0 = await readRange(0x0ea0, 0x10);
    const blockEA8 = await readRange(0x0ea8, 0x10);
    const blockEB0 = await readRange(0x0eb0, 0x20);
    const blockF40 = await readRange(0x0f40, 0x08);
    const block1FF2 = await readRange(0x1ff2, 0x10);

    setProgress(40, true);

    setSelectValue("callChannel", SETTINGS_SELECTS.callChannel, blockE70[0]);
    setSelectValue("squelch", SETTINGS_SELECTS.squelch, Math.max(0, blockE70[1]));
    setSelectValue("txTimeout", TALK_TIME_LIST, blockE70[2]);

    const keyByte = blockE70[4];
    const keyLock = (keyByte >> 7) & 0x01;
    setSelectValue("keypadLock", SET_OFF_ON_LIST, keyLock);

    setSelectValue("micGain", MIC_GAIN_LIST, blockE70[7]);
    const blMin = blockE70[8] & 0x0f;
    const blMax = (blockE70[8] >> 4) & 0x0f;
    setSelectValue("blMin", BACKLIGHT_LVL_LIST, blMin);
    setSelectValue("blMax", BACKLIGHT_LVL_LIST, blMax);

    setSelectValue("chDisp", CHANNELDISP_LIST, blockE70[9]);
    const rxModeIndex = ((blockE70[10] ? 1 : 0) << 1) + (blockE70[12] ? 1 : 0);
    setSelectValue("rxMode", RXMODE_LIST, rxModeIndex);
    setSelectValue("batSave", BATSAVE_LIST, blockE70[11]);
    setSelectValue("backlightTime", BACKLIGHT_LIST, blockE70[13]);

    const nfmSteByte = blockE70[14];
    setSelectValue("setNfm", SET_NFM_LIST, (nfmSteByte >> 1) & 0x03);
    setSelectValue("ste", SET_OFF_ON_LIST, nfmSteByte & 0x01);

    const beepByte = blockE90[0];
    setSelectValue("beep", SET_OFF_ON_LIST, (beepByte >> 7) & 0x01);
    setSelectValue("scanResume", SCANRESUME_LIST, blockE90[5]);
    setSelectValue("autoKeypad", AUTO_KEYPAD_LOCK_LIST, blockE90[6]);
    setSelectValue("pOnMsg", WELCOME_LIST, blockE90[7]);

    // Voice/alarm are hidden; keep values untouched.
    setSelectValue("roger", ROGER_LIST, blockEA8[1]);
    setSelectValue("rpSte", RTE_LIST, blockEA8[2]);
    setSelectValue("txVfo", TX_VFO_LIST, blockEA8[3]);
    setSelectValue("batteryType", BATTYPE_LIST, blockEA8[4]);

    const f40Byte = blockF40[7];
    setSelectValue("blTxRx", BACKLIGHT_TX_RX_LIST, f40Byte & 0x03);
    setSelectValue("amFix", SET_OFF_ON_LIST, (f40Byte >> 2) & 0x01);
    setSelectValue("micBar", SET_OFF_ON_LIST, (f40Byte >> 3) & 0x01);
    setSelectValue("batText", BAT_TXT_LIST, (f40Byte >> 4) & 0x03);

    const setOffByte = block1FF2[2];
    const setGuiByte = block1FF2[3];
    const setTotByte = block1FF2[4];
    const setPwrByte = block1FF2[5];

    setSelectValue("setOff", SET_OFF_TMR_LIST, setOffByte & 0x7f);
    setSelectValue("setTmr", SET_OFF_ON_LIST, (setOffByte >> 7) & 0x01);
    setSelectValue("setGui", SET_MET_LIST, setGuiByte & 0x01);
    setSelectValue("setMet", SET_MET_LIST, (setGuiByte >> 1) & 0x01);
    setSelectValue("setLck", SET_LCK_LIST, (setGuiByte >> 2) & 0x01);
    setSelectValue("setInv", SET_OFF_ON_LIST, (setGuiByte >> 3) & 0x01);
    setSelectValue("setContrast", SETTINGS_SELECTS.setContrast, (setGuiByte >> 4) & 0x0f);
    setSelectValue("setTot", SET_TOT_EOT_LIST, setTotByte & 0x0f);
    setSelectValue("setEot", SET_TOT_EOT_LIST, (setTotByte >> 4) & 0x0f);
    setSelectValue("setPwr", SET_LOW_LIST, setPwrByte & 0x0f);
    setSelectValue("setPtt", SET_PTT_LIST, (setPwrByte >> 4) & 0x0f);

    const logo1 = new TextDecoder().decode(blockEB0.slice(0, 16)).split("\x00")[0].trim();
    const logo2 = new TextDecoder().decode(blockEB0.slice(16, 32)).split("\x00")[0].trim();
    document.getElementById("logo1").value = logo1;
    document.getElementById("logo2").value = logo2;

    setSelectValue("vfoA", SETTINGS_SELECTS.vfoA, Math.max(0, blockE80[1] - 1));
    setSelectValue("vfoB", SETTINGS_SELECTS.vfoB, Math.max(0, blockE80[4] - 1));

    setProgress(100, true);
    setStatus("Settings loaded.");
    setEditEnabled(true);
    setTimeout(() => {
      setProgress(0, false);
      hideModal();
    }, 800);
  } catch (error) {
    setStatus(`Read failed: ${error.message}`, "error");
    setProgress(0, false);
    setEditEnabled(false);
    hideModal();
  } finally {
    disableActions(false);
    release("settings");
  }
};

const writeSettings = async () => {
  if (!isConnected) {
    setStatus("Connect the radio first.", "error");
    return;
  }
  if (!claim("settings")) {
    setStatus("Another tool is using the serial connection.", "error");
    return;
  }
  if (!canEdit) {
    setStatus("Read from the radio before editing.", "error");
    release("settings");
    return;
  }
  const port = getPort();
  if (!port) {
    setStatus("No serial port available.", "error");
    release("settings");
    return;
  }
  disableActions(true);
  setEditEnabled(false);
  setProgress(0, true);
  setStatus("Writing settings...");
  showModal("Writing settings", "Please keep the radio connected.");

  try {
    await eepromInit(port);

    const blockE70 = await readRange(0x0e70, 0x20);
    const blockE80 = await readRange(0x0e80, 0x10);
    const blockE90 = await readRange(0x0e90, 0x10);
    const blockEA0 = await readRange(0x0ea0, 0x10);
    const blockEA8 = await readRange(0x0ea8, 0x10);
    const blockEB0 = await readRange(0x0eb0, 0x20);
    const blockF40 = await readRange(0x0f40, 0x08);
    const block1FF2 = await readRange(0x1ff2, 0x10);

    blockE70[0] = getSelectValue("callChannel", SETTINGS_SELECTS.callChannel);
    blockE70[1] = getSelectValue("squelch", SETTINGS_SELECTS.squelch);
    blockE70[2] = getSelectValue("txTimeout", TALK_TIME_LIST);
    blockE70[7] = getSelectValue("micGain", MIC_GAIN_LIST);
    blockE70[8] =
      (getSelectValue("blMax", BACKLIGHT_LVL_LIST) << 4) |
      getSelectValue("blMin", BACKLIGHT_LVL_LIST);
    blockE70[9] = getSelectValue("chDisp", CHANNELDISP_LIST);

    const rxModeIndex = getSelectValue("rxMode", RXMODE_LIST);
    blockE70[10] = (rxModeIndex & 0x02) ? 1 : 0;
    blockE70[12] = (rxModeIndex & 0x01) ? 1 : 0;
    blockE70[11] = getSelectValue("batSave", BATSAVE_LIST);
    blockE70[13] = getSelectValue("backlightTime", BACKLIGHT_LIST);

    const nfm = getSelectValue("setNfm", SET_NFM_LIST);
    const ste = getSelectValue("ste", SET_OFF_ON_LIST);
    blockE70[14] = ((nfm & 0x03) << 1) | (ste & 0x01);

    blockE70[4] = (blockE70[4] & 0x7f) | (getSelectValue("keypadLock", SET_OFF_ON_LIST) << 7);

    blockE90[0] = (blockE90[0] & 0x7f) | (getSelectValue("beep", SET_OFF_ON_LIST) << 7);
    blockE90[5] = getSelectValue("scanResume", SCANRESUME_LIST);
    blockE90[6] = getSelectValue("autoKeypad", AUTO_KEYPAD_LOCK_LIST);
    blockE90[7] = getSelectValue("pOnMsg", WELCOME_LIST);

    // Voice/alarm are hidden; keep values untouched.
    blockEA8[1] = getSelectValue("roger", ROGER_LIST);
    blockEA8[2] = getSelectValue("rpSte", RTE_LIST);
    blockEA8[3] = getSelectValue("txVfo", TX_VFO_LIST);
    blockEA8[4] = getSelectValue("batteryType", BATTYPE_LIST);

    const f40Value =
      (getSelectValue("blTxRx", BACKLIGHT_TX_RX_LIST) & 0x03) |
      ((getSelectValue("amFix", SET_OFF_ON_LIST) & 0x01) << 2) |
      ((getSelectValue("micBar", SET_OFF_ON_LIST) & 0x01) << 3) |
      ((getSelectValue("batText", BAT_TXT_LIST) & 0x03) << 4);
    blockF40[7] = f40Value;

    const setOff = getSelectValue("setOff", SET_OFF_TMR_LIST);
    const setTmr = getSelectValue("setTmr", SET_OFF_ON_LIST);
    block1FF2[2] = (setOff & 0x7f) | ((setTmr & 0x01) << 7);

    const setGui = getSelectValue("setGui", SET_MET_LIST);
    const setMet = getSelectValue("setMet", SET_MET_LIST);
    const setLck = getSelectValue("setLck", SET_LCK_LIST);
    const setInv = getSelectValue("setInv", SET_OFF_ON_LIST);
    const setContrast = getSelectValue("setContrast", SETTINGS_SELECTS.setContrast);
    block1FF2[3] =
      (setGui & 0x01) |
      ((setMet & 0x01) << 1) |
      ((setLck & 0x01) << 2) |
      ((setInv & 0x01) << 3) |
      ((setContrast & 0x0f) << 4);

    const setTot = getSelectValue("setTot", SET_TOT_EOT_LIST);
    const setEot = getSelectValue("setEot", SET_TOT_EOT_LIST);
    block1FF2[4] = (setTot & 0x0f) | ((setEot & 0x0f) << 4);

    const setPwr = getSelectValue("setPwr", SET_LOW_LIST);
    const setPtt = getSelectValue("setPtt", SET_PTT_LIST);
    block1FF2[5] = (setPwr & 0x0f) | ((setPtt & 0x0f) << 4);

    const logo1 = document.getElementById("logo1").value.padEnd(16, "\x00").slice(0, 16);
    const logo2 = document.getElementById("logo2").value.padEnd(16, "\x00").slice(0, 16);
    blockEB0.set(new TextEncoder().encode(logo1), 0);
    blockEB0.set(new TextEncoder().encode(logo2), 16);

    // VFO A/B are hidden; keep values untouched.

    setProgress(50, true);

    await writeRange(0x0e70, blockE70);
    await writeRange(0x0e80, blockE80);
    await writeRange(0x0e90, blockE90);
    await writeRange(0x0ea0, blockEA0);
    await writeRange(0x0ea8, blockEA8);
    await writeRange(0x0eb0, blockEB0);
    await writeRange(0x0f40, blockF40);
    await writeRange(0x1ff2, block1FF2);
    await eepromReboot(port);

    setProgress(100, true);
    setStatus("Settings written successfully.");
    setTimeout(() => {
      setProgress(0, false);
      hideModal();
    }, 800);
  } catch (error) {
    setStatus(`Write failed: ${error.message}`, "error");
    setProgress(0, false);
    hideModal();
  } finally {
    disableActions(false);
    release("settings");
  }
};

readSettingsBtn.addEventListener("click", readSettings);
writeSettingsBtn.addEventListener("click", writeSettings);
if (connectBtn) connectBtn.addEventListener("click", connectToDevice);
if (disconnectBtn) disconnectBtn.addEventListener("click", disconnectFromDevice);

if (baudSelect) {
  const storedBaud = getPreferredBaud();
  if (storedBaud) baudSelect.value = String(storedBaud);
  baudSelect.addEventListener("change", () => {
    setPreferredBaud(Number(baudSelect.value));
  });
}

subscribe((state) => {
  isConnected = state.connected;
  setConnected(state.connected);
  if (state.connected) {
    setError("");
  }
  if (connectionDot) {
    connectionDot.dataset.status = state.connected ? "connected" : "disconnected";
  }
  if (connectionLabel) {
    connectionLabel.textContent = state.connected ? "Connected" : "Disconnected";
  }
  if (baudSelect && state.baudRate) {
    baudSelect.value = String(state.baudRate);
    setPreferredBaud(state.baudRate);
  }
  updateDeviceInfo(state.port);
  if (firmwareEl) {
    firmwareEl.textContent = state.firmwareVersion || "-";
  }
  if (!state.connected) {
    setEditEnabled(false);
  }
  updateActionState();
});

setStatus("Idle.");
setProgress(0, false);
hideModal();

