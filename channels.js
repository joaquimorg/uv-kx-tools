import {
  EEPROM_BLOCK_SIZE,
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

const readChannelsBtn = document.getElementById("readChannelsBtn");
const writeChannelsBtn = document.getElementById("writeChannelsBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const importCsvBtn = document.getElementById("importCsvBtn");
const searchInput = document.getElementById("channelSearch");
const searchClearBtn = document.getElementById("channelSearchClear");
const searchCount = document.getElementById("channelSearchCount");
const channelStatus = document.getElementById("channelStatus");
const channelBody = document.getElementById("channelBody");
const channelFill = document.getElementById("channelFill");
const channelPct = document.getElementById("channelPct");
const channelModal = document.getElementById("channelModal");
const modalTitle = document.getElementById("modalTitle");
const modalMessage = document.getElementById("modalMessage");
const modalFill = document.getElementById("modalFill");
const modalPct = document.getElementById("modalPct");
const connectBtn = document.getElementById("channelsConnect");
const disconnectBtn = document.getElementById("channelsDisconnect");
const baudSelect = document.getElementById("channelsBaudSelect");
const connectionDot = document.getElementById("channelsStatusDot");
const connectionLabel = document.getElementById("channelsStatusLabel");
const deviceInfo = document.getElementById("channelsDeviceInfo");
const firmwareEl = document.getElementById("channelsFirmware");
const errorEl = document.getElementById("channelsError");
const errorTextEl = errorEl ? errorEl.querySelector(".status-error-text") : null;
const errorCloseBtn = errorEl ? errorEl.querySelector(".status-error-close") : null;

const CHANNEL_COUNT = 200;
const PAGE_SIZE = 20;
const MAX_READ_BLOCK = 0x80;

const MODE_LIST = ["FM", "NFM", "AM", "NAM", "USB"];
const POWER_LIST = [
  "USER",
  "LOW 1 (<20mW)",
  "LOW 2 (125mW)",
  "LOW 3 (250mW)",
  "LOW 4 (500mW)",
  "1.0W",
  "2.0W",
  "5.0W",
];
const PTTID_LIST = ["OFF", "UP CODE", "DOWN CODE", "UP+DOWN CODE", "APOLLO QUINDAR"];
const SCRAMBLER_LIST = [
  "OFF",
  "2600Hz",
  "2700Hz",
  "2800Hz",
  "2900Hz",
  "3000Hz",
  "3100Hz",
  "3200Hz",
  "3300Hz",
  "3400Hz",
  "3500Hz",
];
const SCANLIST_LIST = [
  "None",
  "List [1]",
  "List [2]",
  "List [1, 2]",
  "List [3]",
  "List [1, 3]",
  "List [2, 3]",
  "All List [1, 2, 3]",
];
const STEPS = [
  2.5, 5, 6.25, 10, 12.5, 25, 8.33, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 1.25,
  9, 15, 20, 30, 50, 100, 125, 200, 250, 500,
];
const CTCSS_TONES = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4,
  100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5,
  141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9, 171.3, 173.8,
  177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5, 203.5, 206.5,
  210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
];
const DTCS_CODES = [
  23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74, 114, 115,
  116, 122, 125, 131, 132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174,
  205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255, 261, 263, 265,
  266, 271, 274, 306, 311, 315, 325, 331, 332, 343, 346, 351, 356, 364, 365,
  371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464, 465,
  466, 503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632,
  654, 662, 664, 703, 712, 723, 731, 732, 734, 743, 754,
];

let channels = Array.from({ length: CHANNEL_COUNT }, (_, index) => buildEmptyChannel(index + 1));
let canEdit = false;
let isConnected = false;
let isBusy = false;

function buildEmptyChannel(number) {
  return {
    number,
    name: "",
    rxFreqHz: 0,
    txFreqHz: 0,
    offsetDir: 0,
    offsetHz: 0,
    duplex: "",
    rxToneType: "None",
    rxTone: "",
    txToneType: "None",
    txTone: "",
    power: "USER",
    mode: "FM",
    step: STEPS[0],
    reverse: false,
    scrambler: "OFF",
    busy: false,
    txLock: false,
    pttid: "OFF",
    dtmfDecode: false,
    scanlist: 0,
    compander: 0,
    band: 7,
  };
}

const setStatus = (message, tone = "info") => {
  channelStatus.textContent = message;
  channelStatus.classList.toggle("status-error", tone === "error");
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
  if (!claim("channels")) {
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
    release("channels");
  }
};

const disconnectFromDevice = async () => {
  if (!claim("channels")) {
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
    release("channels");
  }
};

const setProgress = (value, visible = true) => {
  const pct = Math.max(0, Math.min(100, value));
  const container = channelFill.closest(".progress");
  if (container) {
    container.classList.toggle("active", visible);
  }
  channelFill.style.width = `${pct}%`;
  channelPct.textContent = `${pct.toFixed(1)}%`;
  modalFill.style.width = `${pct}%`;
  modalPct.textContent = `${pct.toFixed(1)}%`;
};

const updateActionState = () => {
  readChannelsBtn.disabled = isBusy || !isConnected;
  writeChannelsBtn.disabled = isBusy || !isConnected || !canEdit;
  exportCsvBtn.disabled = isBusy || !canEdit;
  importCsvBtn.disabled = isBusy || !canEdit;
};

const disableActions = (disabled) => {
  isBusy = disabled;
  updateActionState();
};

const setEditEnabled = (enabled) => {
  canEdit = enabled;
  updateActionState();
  renderTable();
};

const showModal = (title, message) => {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  channelModal.classList.add("active");
  channelModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
};

const hideModal = () => {
  channelModal.classList.remove("active");
  channelModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
};

const formatFreq = (freqHz) => {
  if (!freqHz) return "";
  return (freqHz / 1_000_000).toFixed(6);
};

const formatOffset = (offsetHz) => {
  if (!offsetHz) return "";
  return (offsetHz / 1_000_000).toFixed(6);
};

const parseFreq = (value) => {
  const num = Number.parseFloat(value);
  if (Number.isNaN(num) || num <= 0) return 0;
  return Math.round(num * 1_000_000);
};

const updateDuplexFromOffset = (channel) => {
  if (!channel.offsetHz || channel.offsetHz === 0) {
    channel.duplex = "";
    channel.offsetDir = 0;
    channel.txFreqHz = channel.rxFreqHz;
    return;
  }
  if (channel.duplex === "+") {
    channel.offsetDir = 1;
    channel.txFreqHz = channel.rxFreqHz + channel.offsetHz;
  } else if (channel.duplex === "-") {
    channel.offsetDir = 2;
    channel.txFreqHz = channel.rxFreqHz - channel.offsetHz;
  } else {
    channel.duplex = "";
    channel.offsetDir = 0;
    channel.txFreqHz = channel.rxFreqHz;
    channel.offsetHz = 0;
  }
};

const updateOffsetFromMemory = (channel) => {
  if (!channel.rxFreqHz) {
    channel.txFreqHz = 0;
    channel.offsetHz = 0;
    channel.offsetDir = 0;
    channel.duplex = "";
    return;
  }
  if (channel.offsetDir === 1) {
    channel.duplex = "+";
    channel.txFreqHz = channel.rxFreqHz + channel.offsetHz;
  } else if (channel.offsetDir === 2) {
    channel.duplex = "-";
    channel.txFreqHz = channel.rxFreqHz - channel.offsetHz;
  } else {
    channel.duplex = "";
    channel.offsetHz = 0;
    channel.txFreqHz = channel.rxFreqHz;
  }
};

const getToneIndex = (type, value) => {
  if (type === "CTCSS") return CTCSS_TONES.indexOf(Number.parseFloat(value));
  if (type === "DCS" || type === "DCS-R") return DTCS_CODES.indexOf(Number.parseInt(value, 10));
  return 0;
};

const getToneFlag = (type) => {
  if (type === "CTCSS") return 1;
  if (type === "DCS") return 2;
  if (type === "DCS-R") return 3;
  return 0;
};

const getToneValue = (type, code) => {
  if (type === "CTCSS") return CTCSS_TONES[code] ?? "";
  if (type === "DCS" || type === "DCS-R") return DTCS_CODES[code] ?? "";
  return "";
};

const readRange = async (start, length) => {
  const buffer = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += MAX_READ_BLOCK) {
    const size = Math.min(MAX_READ_BLOCK, length - offset);
    const data = await eepromRead(getPort(), start + offset, size);
    buffer.set(data.slice(0, size), offset);
  }
  return buffer;
};

const writeRange = async (start, data) => {
  for (let offset = 0; offset < data.length; offset += EEPROM_BLOCK_SIZE) {
    const chunk = data.slice(offset, offset + EEPROM_BLOCK_SIZE);
    await eepromWrite(getPort(), start + offset, chunk, chunk.length);
  }
};

const decodeChannels = (channelBytes, nameBytes, attrBytes) => {
  const view = new DataView(channelBytes.buffer, channelBytes.byteOffset, channelBytes.byteLength);
  const decoded = [];
  for (let i = 0; i < CHANNEL_COUNT; i += 1) {
    const base = i * 16;
    const channel = buildEmptyChannel(i + 1);
    const freqRaw = view.getUint32(base, true);
    const offsetRaw = view.getUint32(base + 4, true);
    const rxcode = channelBytes[base + 8];
    const txcode = channelBytes[base + 9];
    const flagsTone = channelBytes[base + 10];
    const flagsMode = channelBytes[base + 11];
    const flagsExtra = channelBytes[base + 12];
    const flagsDtmf = channelBytes[base + 13];
    const step = channelBytes[base + 14];
    const scrambler = channelBytes[base + 15];
    const attr = attrBytes[i] ?? 0;

    channel.scanlist = (attr >> 5) & 0x7;
    channel.compander = (attr >> 3) & 0x3;
    channel.band = attr & 0x7;

    const nameSlice = nameBytes.slice(i * 16, i * 16 + 16);
    let name = "";
    for (const byte of nameSlice) {
      if (byte === 0x00 || byte === 0xff) break;
      name += String.fromCharCode(byte);
    }
    channel.name = name.trim();

    if (freqRaw === 0xffffffff || freqRaw === 0) {
      decoded.push(channel);
      continue;
    }

    channel.rxFreqHz = freqRaw * 10;
    channel.offsetHz = offsetRaw * 10;
    channel.offsetDir = flagsMode & 0x0f;
    updateOffsetFromMemory(channel);

    const txcodeflag = (flagsTone >> 4) & 0x0f;
    const rxcodeflag = flagsTone & 0x0f;
    channel.rxToneType = ["None", "CTCSS", "DCS", "DCS-R"][rxcodeflag] ?? "None";
    channel.txToneType = ["None", "CTCSS", "DCS", "DCS-R"][txcodeflag] ?? "None";
    channel.rxTone = getToneValue(channel.rxToneType, rxcode);
    channel.txTone = getToneValue(channel.txToneType, txcode);

    const modulation = (flagsMode >> 4) & 0x0f;
    const bandwidth = (flagsExtra >> 1) & 0x01;
    const tempMode = modulation * 2 + bandwidth;
    channel.mode = MODE_LIST[tempMode] ?? (tempMode === 5 ? "USB" : "FM");

    const txpower = (flagsExtra >> 2) & 0x07;
    channel.power = POWER_LIST[txpower] ?? "USER";
    channel.reverse = Boolean(flagsExtra & 0x01);
    channel.busy = Boolean(flagsExtra & 0x20);
    channel.txLock = Boolean(flagsExtra & 0x40);

    channel.pttid = PTTID_LIST[(flagsDtmf >> 1) & 0x07] ?? "OFF";
    channel.dtmfDecode = Boolean(flagsDtmf & 0x01);

    channel.step = STEPS[step] ?? STEPS[0];
    channel.scrambler = SCRAMBLER_LIST[scrambler] ?? "OFF";

    decoded.push(channel);
  }
  return decoded;
};

const encodeChannels = () => {
  const channelBytes = new Uint8Array(CHANNEL_COUNT * 16);
  const nameBytes = new Uint8Array(CHANNEL_COUNT * 16).fill(0xff);
  const attrBytes = new Uint8Array(CHANNEL_COUNT).fill(0x00);
  const view = new DataView(channelBytes.buffer);

  channels.forEach((channel, index) => {
    const base = index * 16;
    const isEmpty = !channel.rxFreqHz && !channel.name;
    if (isEmpty) {
      channelBytes.fill(0xff, base, base + 16);
      return;
    }

    const freqRaw = Math.round(channel.rxFreqHz / 10);
    const offsetRaw = Math.round(channel.offsetHz / 10);
    view.setUint32(base, freqRaw, true);
    view.setUint32(base + 4, offsetRaw, true);

    const rxToneFlag = getToneFlag(channel.rxToneType);
    const txToneFlag = getToneFlag(channel.txToneType);
    const rxToneIndex = getToneIndex(channel.rxToneType, channel.rxTone);
    const txToneIndex = getToneIndex(channel.txToneType, channel.txTone);

    channelBytes[base + 8] = rxToneIndex < 0 ? 0 : rxToneIndex;
    channelBytes[base + 9] = txToneIndex < 0 ? 0 : txToneIndex;
    channelBytes[base + 10] = ((txToneFlag & 0x0f) << 4) | (rxToneFlag & 0x0f);

    const modeIndex = MODE_LIST.indexOf(channel.mode);
    const modulation = modeIndex >= 0 ? Math.floor(modeIndex / 2) : 0;
    const bandwidth = modeIndex >= 0 ? modeIndex % 2 : 0;
    channelBytes[base + 11] = ((modulation & 0x0f) << 4) | (channel.offsetDir & 0x0f);

    const powerIndex = Math.max(0, POWER_LIST.indexOf(channel.power));
    let flagsExtra = 0;
    flagsExtra |= channel.reverse ? 0x01 : 0;
    flagsExtra |= (bandwidth & 0x01) << 1;
    flagsExtra |= (powerIndex & 0x07) << 2;
    flagsExtra |= channel.busy ? 0x20 : 0;
    flagsExtra |= channel.txLock ? 0x40 : 0;
    channelBytes[base + 12] = flagsExtra;

    let flagsDtmf = 0;
    const pttidIndex = Math.max(0, PTTID_LIST.indexOf(channel.pttid));
    flagsDtmf |= (pttidIndex & 0x07) << 1;
    flagsDtmf |= channel.dtmfDecode ? 0x01 : 0;
    channelBytes[base + 13] = flagsDtmf;

    const stepIndex = Math.max(0, STEPS.indexOf(channel.step));
    channelBytes[base + 14] = stepIndex;
    channelBytes[base + 15] = Math.max(0, SCRAMBLER_LIST.indexOf(channel.scrambler));

    const name = channel.name.trim().slice(0, 10);
    if (name) {
      for (let i = 0; i < name.length; i += 1) {
        nameBytes[index * 16 + i] = name.charCodeAt(i);
      }
    }

    const attr =
      ((channel.scanlist & 0x7) << 5) | ((channel.compander & 0x3) << 3) | (channel.band & 0x7);
    attrBytes[index] = attr;
  });

  return { channelBytes, nameBytes, attrBytes };
};

const renderTable = () => {
  const start = 0;
  const end = CHANNEL_COUNT;
  const termRaw = searchInput ? searchInput.value.trim() : "";
  const term = termRaw.length >= 3 ? termRaw.toLowerCase() : "";

  const rows = [];
  let matchCount = 0;
  let firstMatchIndex = null;
  for (let i = start; i < end; i += 1) {
    const channel = channels[i];
    const nameMatch = channel.name && channel.name.toLowerCase().includes(term);
    const freqMatch = formatFreq(channel.rxFreqHz).includes(term);
    const isMatch = term && (nameMatch || freqMatch);
    if (isMatch) {
      matchCount += 1;
      if (firstMatchIndex === null) {
        firstMatchIndex = i;
      }
    }
    rows.push(`
      <tr${isMatch ? ' class="row-match"' : ""}${isMatch && i === firstMatchIndex ? ' data-first-match="true"' : ""}>
        <td>${channel.number}</td>
        <td><input type="text" data-index="${i}" data-field="name" value="${channel.name}" maxlength="10" ${canEdit ? "" : "disabled"} /></td>
        <td><input type="text" data-index="${i}" data-field="rxFreq" value="${formatFreq(channel.rxFreqHz)}" ${canEdit ? "" : "disabled"} /></td>
        <td>${buildSelect("duplex", i, ["", "+", "-"], channel.duplex, !canEdit)}</td>
        <td><input type="text" data-index="${i}" data-field="offset" value="${formatOffset(channel.offsetHz)}" ${canEdit && channel.duplex ? "" : "disabled"} /></td>
        <td>${buildSelect("power", i, POWER_LIST, channel.power, !canEdit)}</td>
        <td>${buildSelect("mode", i, MODE_LIST, channel.mode, !canEdit)}</td>
        <td>${buildSelect("rxToneType", i, ["None", "CTCSS", "DCS", "DCS-R"], channel.rxToneType, !canEdit)}</td>
        <td>${buildToneSelect("rxTone", i, channel.rxToneType, channel.rxTone, !canEdit)}</td>
        <td>${buildSelect("txToneType", i, ["None", "CTCSS", "DCS", "DCS-R"], channel.txToneType, !canEdit)}</td>
        <td>${buildToneSelect("txTone", i, channel.txToneType, channel.txTone, !canEdit)}</td>
        <td>${buildSelect("step", i, STEPS.map(String), String(channel.step), !canEdit)}</td>
        <td><input type="checkbox" data-index="${i}" data-field="reverse" ${channel.reverse ? "checked" : ""} ${canEdit ? "" : "disabled"} /></td>
        <td><input type="checkbox" data-index="${i}" data-field="busy" ${channel.busy ? "checked" : ""} ${canEdit ? "" : "disabled"} /></td>
        <td><input type="checkbox" data-index="${i}" data-field="txLock" ${channel.txLock ? "checked" : ""} ${canEdit ? "" : "disabled"} /></td>
        <td>${buildSelect("pttid", i, PTTID_LIST, channel.pttid, !canEdit)}</td>
        <td>${buildSelect("scanlist", i, SCANLIST_LIST, SCANLIST_LIST[channel.scanlist] ?? "None", !canEdit)}</td>
        <td class="row-actions">
          <span
            class="action-icon"
            data-action="insert"
            data-index="${i}"
            data-tooltip="Insert blank line below"
            aria-label="Insert"
            ${canEdit ? "" : "data-disabled=\"true\""}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </span>
          <span
            class="action-icon"
            data-action="remove"
            data-index="${i}"
            data-tooltip="Remove"
            aria-label="Remove"
            ${canEdit ? "" : "data-disabled=\"true\""}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M6 6l1 14h10l1-14" />
            </svg>
          </span>
        </td>
      </tr>
    `);
  }
  channelBody.innerHTML = rows.join("");

  if (searchCount) {
    if (!term) {
      searchCount.textContent = "";
    } else {
      searchCount.textContent = `${matchCount} found`;
    }
  }

  if (term && firstMatchIndex !== null) {
    const firstRow = channelBody.querySelector('tr[data-first-match="true"]');
    const tableWrap = channelBody.closest(".table-wrap");
    if (firstRow && tableWrap) {
      const header = tableWrap.querySelector("thead");
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const rowTop = firstRow.getBoundingClientRect().top;
      const wrapTop = tableWrap.getBoundingClientRect().top;
      const offset = rowTop - wrapTop;
      tableWrap.scrollTop += offset - headerHeight - 8;
    } else if (firstRow) {
      firstRow.scrollIntoView({ block: "center" });
    }
  }
};

const buildSelect = (field, index, options, selected, disabled = false) => {
  const opts = options
    .map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`)
    .join("");
  return `<select data-index="${index}" data-field="${field}" ${disabled ? "disabled" : ""}>${opts}</select>`;
};

const buildToneSelect = (field, index, type, selected, disabled = false) => {
  let options = [];
  if (type === "CTCSS") {
    options = CTCSS_TONES.map((tone) => tone.toFixed(1));
  } else if (type === "DCS" || type === "DCS-R") {
    options = DTCS_CODES.map(String);
  }
  const opts = options
    .map((value) => `<option value="${value}" ${String(value) === String(selected) ? "selected" : ""}>${value}</option>`)
    .join("");
  const disabledAttr = options.length === 0 || disabled ? "disabled" : "";
  return `<select data-index="${index}" data-field="${field}" ${disabledAttr}>${opts}</select>`;
};

const renumberChannels = () => {
  channels.forEach((channel, index) => {
    channel.number = index + 1;
  });
};

const ensureTooltip = () => {
  let tooltip = document.getElementById("actionTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "actionTooltip";
    tooltip.className = "action-tooltip";
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
  }
  return tooltip;
};

const showTooltip = (icon) => {
  const tooltip = ensureTooltip();
  const text = icon.dataset.tooltip;
  if (!text) return;
  tooltip.textContent = text;
  tooltip.hidden = false;
  const rect = icon.getBoundingClientRect();
  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 8}px`;
};

const hideTooltip = () => {
  const tooltip = document.getElementById("actionTooltip");
  if (tooltip) {
    tooltip.hidden = true;
  }
};

const removeChannel = (index) => {
  if (!canEdit) return;
  channels.splice(index, 1);
  channels.push(buildEmptyChannel(channels.length + 1));
  renumberChannels();
  renderTable();
  setStatus("Channel removed.");
};

const insertChannel = (index) => {
  if (!canEdit) return;
  channels.splice(index, 0, buildEmptyChannel(0));
  while (channels.length > CHANNEL_COUNT) {
    channels.pop();
  }
  renumberChannels();
  renderTable();
  setStatus("Blank channel inserted.");
};

channelBody.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const index = Number.parseInt(target.dataset.index, 10);
  const field = target.dataset.field;
  if (Number.isNaN(index) || !field) return;

  const channel = channels[index];
  if (!channel) return;

  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    channel[field] = target.checked;
  } else if (field === "rxFreq") {
    channel.rxFreqHz = parseFreq(target.value);
    updateDuplexFromOffset(channel);
  } else if (field === "duplex") {
    channel.duplex = target.value;
    updateDuplexFromOffset(channel);
  } else if (field === "offset") {
    const offset = Number.parseFloat(target.value);
    channel.offsetHz = Number.isNaN(offset) ? 0 : Math.round(offset * 1_000_000);
    updateDuplexFromOffset(channel);
  } else if (field === "step") {
    channel.step = Number.parseFloat(target.value);
  } else if (field === "scanlist") {
    channel.scanlist = SCANLIST_LIST.indexOf(target.value);
  } else {
    if (field === "name" && target instanceof HTMLInputElement) {
      const upper = target.value.toUpperCase();
      if (upper !== target.value) {
        target.value = upper;
      }
      channel[field] = upper;
    } else {
      channel[field] = target.value;
    }
  }

  if (field === "rxToneType" && channel.rxToneType !== "CTCSS") {
    channel.rxTone = channel.rxToneType.startsWith("DCS") ? DTCS_CODES[0] : "";
  }
  if (field === "rxToneType" && channel.rxToneType === "CTCSS") {
    channel.rxTone = CTCSS_TONES[0].toFixed(1);
  }
  if (field === "txToneType" && channel.txToneType !== "CTCSS") {
    channel.txTone = channel.txToneType.startsWith("DCS") ? DTCS_CODES[0] : "";
  }
  if (field === "txToneType" && channel.txToneType === "CTCSS") {
    channel.txTone = CTCSS_TONES[0].toFixed(1);
  }

  if (field === "rxToneType" || field === "txToneType") {
    renderTable();
  }
});

channelBody.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const icon = target.closest(".action-icon");
  if (!icon || icon.dataset.disabled === "true") return;
  const action = icon.dataset.action;
  const index = Number.parseInt(icon.dataset.index, 10);
  if (!action || Number.isNaN(index)) return;

  if (action === "remove") {
    removeChannel(index);
  } else if (action === "insert") {
    insertChannel(index);
  }
});

if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderTable();
  });
}

if (searchClearBtn && searchInput) {
  const clearSearch = () => {
    searchInput.value = "";
    searchInput.focus();
    renderTable();
  };
  searchClearBtn.addEventListener("click", clearSearch);
  searchClearBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      clearSearch();
    }
  });
}

channelBody.addEventListener("pointerover", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const icon = target.closest(".action-icon");
  if (!icon || icon.dataset.disabled === "true") return;
  showTooltip(icon);
});

channelBody.addEventListener("pointerout", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const icon = target.closest(".action-icon");
  if (!icon) return;
  const related = event.relatedTarget;
  if (related instanceof Element && related.closest(".action-icon") === icon) return;
  hideTooltip();
});

const readChannels = async () => {
  if (!isConnected) {
    setStatus("Connect the radio first.", "error");
    return;
  }
  if (!claim("channels")) {
    setStatus("Another tool is using the serial connection.", "error");
    return;
  }
  const port = getPort();
  if (!port) {
    setStatus("No serial port available.", "error");
    release("channels");
    return;
  }
  disableActions(true);
  setEditEnabled(false);
  setProgress(0, true);
  setStatus("Reading channels...");
  showModal("Reading channels", "Please keep the radio connected.");
  try {
    await eepromInit(port);

    const totalReads = 3;
    let progressStep = 0;
    const updateProgress = () => {
      progressStep += 1;
      setProgress((progressStep / totalReads) * 100, true);
    };

    const channelBytes = await readRange(0x0000, CHANNEL_COUNT * 16);
    updateProgress();
    const attrBytes = await readRange(0x0d60, CHANNEL_COUNT);
    updateProgress();
    const nameBytes = await readRange(0x0f50, CHANNEL_COUNT * 16);
    updateProgress();

    channels = decodeChannels(channelBytes, nameBytes, attrBytes);
    setEditEnabled(true);
    renderTable();
    setStatus("Channels loaded.");
    setProgress(100, true);
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
    release("channels");
  }
};

const writeChannels = async () => {
  if (!isConnected) {
    setStatus("Connect the radio first.", "error");
    return;
  }
  if (!claim("channels")) {
    setStatus("Another tool is using the serial connection.", "error");
    return;
  }
  if (!canEdit) {
    setStatus("Read from the radio before editing.", "error");
    release("channels");
    return;
  }
  const port = getPort();
  if (!port) {
    setStatus("No serial port available.", "error");
    release("channels");
    return;
  }
  disableActions(true);
  setProgress(0, true);
  setStatus("Writing channels...");
  showModal("Writing channels", "Please keep the radio connected.");
  try {
    await eepromInit(port);

    const { channelBytes, nameBytes, attrBytes } = encodeChannels();
    const totalWrites = 3;
    let progressStep = 0;
    const updateProgress = () => {
      progressStep += 1;
      setProgress((progressStep / totalWrites) * 100, true);
    };

    await writeRange(0x0000, channelBytes);
    updateProgress();
    await writeRange(0x0d60, attrBytes);
    updateProgress();
    await writeRange(0x0f50, nameBytes);
    updateProgress();

    await eepromReboot(port);
    setStatus("Channels written successfully.");
    setProgress(100, true);
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
    release("channels");
  }
};

const exportCsv = () => {
  if (!canEdit) {
    setStatus("Read from the radio before exporting.", "error");
    return;
  }
  const headers = [
    "number",
    "name",
    "frequency_mhz",
    "duplex",
    "offset_mhz",
    "power",
    "mode",
    "rx_tone_type",
    "rx_tone",
    "tx_tone_type",
    "tx_tone",
    "step",
    "reverse",
    "busy",
    "tx_lock",
    "pttid",
    "scanlist",
  ];
  const rows = channels
    .filter((channel) => {
      const name = (channel.name || "").trim();
      const freq = formatFreq(channel.rxFreqHz);
      return name && freq;
    })
    .map((channel) => [
      channel.number,
      channel.name,
      formatFreq(channel.rxFreqHz),
      channel.duplex,
      formatOffset(channel.offsetHz),
      channel.power,
      channel.mode,
      channel.rxToneType,
      channel.rxTone,
      channel.txToneType,
      channel.txTone,
      channel.step,
      channel.reverse ? "1" : "0",
      channel.busy ? "1" : "0",
      channel.txLock ? "1" : "0",
      channel.pttid,
      SCANLIST_LIST[channel.scanlist] ?? "None",
    ]);
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "uv-k5-channels.csv";
  link.click();
  URL.revokeObjectURL(url);
};

const importCsv = () => {
  if (!canEdit) {
    setStatus("Read from the radio before importing.", "error");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    const dataLines = lines.slice(1);
    dataLines.forEach((line, idx) => {
      const columns = line.split(",");
      if (columns.length < 10) return;
      const channel = channels[idx];
      if (!channel) return;
    channel.name = columns[1] ?? "";
      channel.rxFreqHz = parseFreq(columns[2]);
      channel.duplex = columns[3] ?? "";
      channel.offsetHz = Math.round((Number.parseFloat(columns[4]) || 0) * 1_000_000);
      channel.power = columns[5] ?? "USER";
      channel.mode = columns[6] ?? "FM";
      channel.rxToneType = columns[7] ?? "None";
      channel.rxTone = columns[8] ?? "";
      channel.txToneType = columns[9] ?? "None";
      channel.txTone = columns[10] ?? "";
      channel.step = Number.parseFloat(columns[11]) || STEPS[0];
      channel.reverse = columns[12] === "1";
      channel.busy = columns[13] === "1";
      channel.txLock = columns[14] === "1";
      channel.pttid = columns[15] ?? "OFF";
      channel.scanlist = Math.max(0, SCANLIST_LIST.indexOf(columns[16]));
      updateDuplexFromOffset(channel);
    });
    renderTable();
    setStatus("CSV imported.");
  };
  input.click();
};

readChannelsBtn.addEventListener("click", readChannels);
writeChannelsBtn.addEventListener("click", writeChannels);
exportCsvBtn.addEventListener("click", exportCsv);
importCsvBtn.addEventListener("click", importCsv);
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

setEditEnabled(false);
setStatus("Idle.");
setProgress(0, false);
hideModal();
