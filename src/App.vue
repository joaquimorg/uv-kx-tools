
<template>
  <main class="app tool-scope">
    <HomePage />
    <ChannelsPage />
    <SettingsPage />
    <MirrorPage />
    <SmrPage />
    <AppFooter />
  </main>

  <ChannelModal />
  <SettingsModal />
  <ActionTooltip />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onBeforeUpdate, onMounted, provide, reactive, ref, watch } from "vue";
import { AppStateKey } from "./state/appStateKey.js";
import ActionTooltip from "./components/ActionTooltip.vue";
import AppFooter from "./components/AppFooter.vue";
import ChannelModal from "./components/ChannelModal.vue";
import ChannelsPage from "./components/ChannelsPage.vue";
import HomePage from "./components/HomePage.vue";
import MirrorPage from "./components/MirrorPage.vue";
import SettingsModal from "./components/SettingsModal.vue";
import SettingsPage from "./components/SettingsPage.vue";
import SmrPage from "./components/SmrPage.vue";
import {
  EEPROM_BLOCK_SIZE,
  FLASH_BLOCK_SIZE,
  sendPacket,
  readPacket,
  eepromInit,
  eepromRead,
  eepromWrite,
  eepromReboot,
  unpackFirmware,
  unpackFirmwareVersion,
  flashGenerateCommand,
} from "./lib/protocol.js";
import {
  connect as connectSerial,
  disconnect as disconnectSerial,
  claim,
  release,
  getPort,
  subscribe,
  getPreferredBaud,
  setPreferredBaud,
} from "./lib/serial-manager.js";

const pageTitles = {
  home: "UV-K5 Tools",
  channels: "Channel configuration",
  settings: "Basic settings",
  mirror: "Display mirror",
  smr: "SMR",
};

const bodyClassForPage = {
  mirror: "mirror-page",
  smr: "smr-page",
};

const activePage = ref("home");
const currentYear = new Date().getFullYear();

const serialState = reactive({
  port: null,
  baudRate: null,
  connected: false,
  firmwareVersion: "-",
  refreshingFirmware: false,
  activeClient: null,
});

const USB_DEVICE_LABELS = {
  "1a86:7523": "CH340",
  "10c4:ea60": "CP210x",
  "067b:2303": "PL2303",
  "0403:6001": "FT232",
};

const baud = ref(String(getPreferredBaud() || 115200));
watch(baud, (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    setPreferredBaud(numeric);
  }
});

const isConnected = computed(() => serialState.connected);
const firmwareLabel = computed(() => serialState.firmwareVersion || "-");
const deviceInfoText = computed(() => {
  const port = serialState.port;
  if (!port) return "No serial port selected.";
  const info = port.getInfo ? port.getInfo() : {};
  const details = [];
  let label = "";
  if (info.usbVendorId && info.usbProductId) {
    const vidHex = info.usbVendorId.toString(16);
    const pidHex = info.usbProductId.toString(16);
    const key = `${vidHex}:${pidHex}`;
    label = USB_DEVICE_LABELS[key] || "";
    details.push(`VID ${vidHex}`);
    details.push(`PID ${pidHex}`);
  } else {
    if (info.usbVendorId) details.push(`VID ${info.usbVendorId.toString(16)}`);
    if (info.usbProductId) details.push(`PID ${info.usbProductId.toString(16)}`);
  }
  if (label) {
    return `Active port (${label}, ${details.join(" / ")})`;
  }
  return details.length ? `Active port (${details.join(" / ")})` : "Serial port ready.";
});

const updatePageMeta = (pageId) => {
  document.title = pageTitles[pageId] || pageTitles.home;
  document.body.classList.remove("mirror-page", "smr-page");
  const bodyClass = bodyClassForPage[pageId];
  if (bodyClass) {
    document.body.classList.add(bodyClass);
  }
};

const resolvePageFromHash = () => {
  const hash = window.location.hash.replace("#", "");
  if (hash && Object.prototype.hasOwnProperty.call(pageTitles, hash)) {
    return hash;
  }
  return "home";
};

const ensureDefaultHash = () => {
  if (!window.location.hash) {
    window.location.hash = "#home";
  }
};

const syncPageFromHash = () => {
  ensureDefaultHash();
  const pageId = resolvePageFromHash();
  activePage.value = pageId;
  updatePageMeta(pageId);
  window.scrollTo({ top: 0, behavior: "auto" });
};

const formatPercent = (value) => `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;

const clampPercent = (value) => Math.max(0, Math.min(100, value));

const logEntries = ref([]);
const log = (message, tone = "info") => {
  const timestamp = new Date().toLocaleTimeString("en-US");
  logEntries.value.push({
    id: `${Date.now()}-${Math.random()}`,
    tone,
    text: `[${timestamp}] ${message}`,
  });
  nextTick(() => {
    const logEl = document.getElementById("logOutput");
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });
};
const clearLog = () => {
  logEntries.value = [];
};

const homeError = ref("");
const backupIncludeCal = ref(false);
const restoreIncludeCal = ref(false);
const firmwareSource = ref("local");
const useGithubFirmware = computed(() => firmwareSource.value === "github");
const restoreFileInput = ref(null);
const firmwareFileInput = ref(null);

const backupProgress = ref(0);
const backupProgressVisible = ref(false);
const restoreProgress = ref(0);
const restoreProgressVisible = ref(false);
const flashProgress = ref(0);
const flashProgressVisible = ref(false);

const EEPROM_CONFIG_END = 0x1e00;
const EEPROM_CAL_END = 0x2000;
const FIRMWARE_GITHUB_URL =
  "https://cdn.jsdelivr.net/gh/joaquimorg/UV-KX-firmware@main/firmware/uv-kx_V1.0.packed.bin";
const OFFICIAL_VERSION_PACKET = new Uint8Array([
  48, 5, 16, 0, 42, 79, 69, 70, 87, 45, 76, 79, 83, 69, 72, 85, 0, 0, 0, 0,
]);

const setProgress = (progressRef, visibleRef, value, visible = true) => {
  progressRef.value = clampPercent(value);
  visibleRef.value = visible;
};

const hideProgressLater = (progressRef, visibleRef) => {
  setTimeout(() => setProgress(progressRef, visibleRef, 0, false), 800);
};

const downloadBlob = (data, filename) => {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const connectHome = async () => {
  if (!claim("home")) {
    const message = "Another tool is using the serial connection.";
    homeError.value = message;
    log(message, "error");
    return;
  }
  homeError.value = "";
  try {
    await connectSerial({ baudRate: Number(baud.value) });
    homeError.value = "";
    log(`Connected at ${baud.value} bps.`);
  } catch (error) {
    const message = `Failed to connect: ${error.message}`;
    homeError.value = message;
    log(message, "error");
  } finally {
    release("home");
  }
};

const disconnectHome = async () => {
  if (!claim("home")) {
    const message = "Another tool is using the serial connection.";
    homeError.value = message;
    log(message, "error");
    return;
  }
  homeError.value = "";
  try {
    await disconnectSerial({ keepPort: true });
    homeError.value = "";
    log("Serial port disconnected.");
  } catch (error) {
    const message = `Failed to disconnect: ${error.message}`;
    homeError.value = message;
    log(message, "error");
  } finally {
    release("home");
  }
};

const backupRange = async (start, end, fileName) => {
  await connectSerial({ baudRate: Number(baud.value) });
  const rawEEPROM = new Uint8Array(end - start);
  setProgress(backupProgress, backupProgressVisible, 0, true);
  for (let i = start; i < end; i += EEPROM_BLOCK_SIZE) {
    const data = await eepromRead(getPort(), i, EEPROM_BLOCK_SIZE);
    rawEEPROM.set(data, i - start);
    const pct = ((i - start) / rawEEPROM.length) * 100;
    setProgress(backupProgress, backupProgressVisible, pct, true);
  }
  setProgress(backupProgress, backupProgressVisible, 100);
  hideProgressLater(backupProgress, backupProgressVisible);
  downloadBlob(new Blob([rawEEPROM], { type: "application/octet-stream" }), fileName);
};

const restoreRange = async (start, input) => {
  await connectSerial({ baudRate: Number(baud.value) });
  const rawEEPROM = new Uint8Array(await input.arrayBuffer());
  setProgress(restoreProgress, restoreProgressVisible, 0, true);
  for (let i = start; i < rawEEPROM.length + start; i += EEPROM_BLOCK_SIZE) {
    const chunk = rawEEPROM.slice(i - start, i - start + EEPROM_BLOCK_SIZE);
    await eepromWrite(getPort(), i, chunk, chunk.length);
    const pct = ((i - start) / rawEEPROM.length) * 100;
    setProgress(restoreProgress, restoreProgressVisible, pct, true);
  }
  setProgress(restoreProgress, restoreProgressVisible, 100);
  hideProgressLater(restoreProgress, restoreProgressVisible);
  await eepromReboot(getPort());
};

const backupEeprom = async () => {
  if (!claim("home")) {
    log("Another tool is using the serial connection.", "error");
    return;
  }
  const includeCal = backupIncludeCal.value;
  const end = includeCal ? EEPROM_CAL_END : EEPROM_CONFIG_END;
  const fileName = includeCal ? "uv-k5-eeprom-with-cal.bin" : "uv-k5-eeprom-no-cal.bin";
  log(`Starting EEPROM backup (${includeCal ? "with" : "without"} calibration).`);
  try {
    await backupRange(0, end, fileName);
    log("Backup completed.", "success");
  } catch (error) {
    log(`Backup failed: ${error.message}`, "error");
    setProgress(backupProgress, backupProgressVisible, 0, false);
  } finally {
    release("home");
  }
};

const restoreEeprom = async () => {
  if (!claim("home")) {
    log("Another tool is using the serial connection.", "error");
    return;
  }
  const inputEl = restoreFileInput.value;
  const file = inputEl && inputEl.files ? inputEl.files[0] : null;
  if (!file) {
    log("Select a .bin file to restore.", "error");
    release("home");
    return;
  }
  const includeCal = restoreIncludeCal.value;
  const maxSize = includeCal ? EEPROM_CAL_END : EEPROM_CONFIG_END;
  if (file.size > maxSize) {
    log(`File too large for this mode. Max size is ${maxSize} bytes.`, "error");
    release("home");
    return;
  }
  log(`Starting EEPROM restore (${includeCal ? "with" : "without"} calibration).`);
  try {
    await restoreRange(0, file);
    log("Restore completed.", "success");
  } catch (error) {
    log(`Restore failed: ${error.message}`, "error");
    setProgress(restoreProgress, restoreProgressVisible, 0, false);
  } finally {
    release("home");
  }
};

const flashFirmware = async () => {
  if (!claim("home")) {
    log("Another tool is using the serial connection.", "error");
    return;
  }
  if (!useGithubFirmware.value) {
    const inputEl = firmwareFileInput.value;
    if (!inputEl || !inputEl.files || !inputEl.files.length) {
      log("Select a firmware file or choose the GitHub option.", "error");
      release("home");
      return;
    }
  }

  const previousBaud = Number(baud.value || 115200);
  try {
    baud.value = "38400";
    await disconnectSerial({ keepPort: true });
    await connectSerial({ baudRate: 38400, skipFirmwareRefresh: true });
    let flashingPort = getPort();
    if (!flashingPort) {
      throw new Error("No serial port available.");
    }
    const info = flashingPort.getInfo ? flashingPort.getInfo() : {};
    if (info.usbVendorId || info.usbProductId) {
      const vid = info.usbVendorId ? info.usbVendorId.toString(16) : "n/a";
      const pid = info.usbProductId ? info.usbProductId.toString(16) : "n/a";
      log(`Active port VID/PID: ${vid}/${pid}.`);
    }

    setProgress(flashProgress, flashProgressVisible, 0, true);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      log(`Waiting for bootloader (attempt ${attempt}/3)...`);
      try {
        await readPacket(flashingPort, 0x18, 4000);
        break;
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        log(`Bootloader wait failed: ${message}`, "error");
        if (attempt === 3) {
          throw error;
        }
        await disconnectSerial({ keepPort: true });
        await connectSerial({ baudRate: 38400, allowPrompt: false, skipFirmwareRefresh: true });
        flashingPort = getPort();
        if (!flashingPort) {
          throw new Error("No serial port available.");
        }
      }
    }
    log("Bootloader ready.");

    let firmwareEncoded;
    if (useGithubFirmware.value) {
      log("Downloading firmware from GitHub...");
      const response = await fetch(FIRMWARE_GITHUB_URL);
      if (!response.ok) {
        throw new Error(`Failed to download firmware (${response.status}).`);
      }
      firmwareEncoded = new Uint8Array(await response.arrayBuffer());
    } else {
      const file = firmwareFileInput.value.files[0];
      firmwareEncoded = new Uint8Array(await file.arrayBuffer());
    }
    const rawVersion = unpackFirmwareVersion(firmwareEncoded);
    const versionText = new TextDecoder().decode(rawVersion).replace(/\0.*$/, "");
    log(`Firmware version detected: ${versionText || "unknown"}`);

    await sendPacket(flashingPort, OFFICIAL_VERSION_PACKET);
    try {
      await readPacket(flashingPort, 0x18, 3000);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      log(`Bootloader handshake failed: ${message}`, "error");
      throw error;
    }

    const firmware = unpackFirmware(firmwareEncoded);
    if (firmware.length > 0xf000) {
      throw new Error("Firmware size too large for official flashing.");
    }

    for (let i = 0; i < firmware.length; i += FLASH_BLOCK_SIZE) {
      const data = firmware.slice(i, i + FLASH_BLOCK_SIZE);
      const command = flashGenerateCommand(data, i, firmware.length);
      await sendPacket(flashingPort, command);
      try {
        await readPacket(flashingPort, 0x1a, 3000);
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        log(`Flash block ${i} failed: ${message}`, "error");
        throw error;
      }
      const pct = (i / firmware.length) * 100;
      setProgress(flashProgress, flashProgressVisible, pct, true);
    }

    setProgress(flashProgress, flashProgressVisible, 100);
    hideProgressLater(flashProgress, flashProgressVisible);
    log("Firmware programmed successfully.", "success");
  } catch (error) {
    log(`Firmware programming failed: ${error.message}`, "error");
    setProgress(flashProgress, flashProgressVisible, 0, false);
  } finally {
    await disconnectSerial({ keepPort: true });
    baud.value = String(previousBaud);
    setPreferredBaud(previousBaud);
    release("home");
  }
};

const CHANNEL_COUNT = 200;
const MAX_READ_BLOCK = 0x80;
const modeList = ["FM", "NFM", "AM", "NAM", "USB"];
const powerList = [
  "USER",
  "LOW 1 (<20mW)",
  "LOW 2 (125mW)",
  "LOW 3 (250mW)",
  "LOW 4 (500mW)",
  "1.0W",
  "2.0W",
  "5.0W",
];
const pttidList = ["OFF", "UP CODE", "DOWN CODE", "UP+DOWN CODE", "APOLLO QUINDAR"];
const scramblerList = [
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
const scanlistList = [
  "None",
  "List [1]",
  "List [2]",
  "List [1, 2]",
  "List [3]",
  "List [1, 3]",
  "List [2, 3]",
  "All List [1, 2, 3]",
];
const steps = [
  2.5, 5, 6.25, 10, 12.5, 25, 8.33, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 1.25,
  9, 15, 20, 30, 50, 100, 125, 200, 250, 500,
];
const ctcssTones = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4,
  100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5,
  141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9, 171.3, 173.8,
  177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5, 203.5, 206.5,
  210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
];
const dtcsCodes = [
  23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74, 114, 115,
  116, 122, 125, 131, 132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174,
  205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255, 261, 263, 265,
  266, 271, 274, 306, 311, 315, 325, 331, 332, 343, 346, 351, 356, 364, 365,
  371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464, 465,
  466, 503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632,
  654, 662, 664, 703, 712, 723, 731, 732, 734, 743, 754,
];
const toneTypeList = ["None", "CTCSS", "DCS", "DCS-R"];

const buildEmptyChannel = (number) => ({
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
  step: steps[0],
  reverse: false,
  scrambler: "OFF",
  busy: false,
  txLock: false,
  pttid: "OFF",
  dtmfDecode: false,
  scanlist: 0,
  compander: 0,
  band: 7,
});

const channels = ref(Array.from({ length: CHANNEL_COUNT }, (_, index) => buildEmptyChannel(index + 1)));
const channelsCanEdit = ref(false);
const channelsBusy = ref(false);
const channelsError = ref("");
const channelStatus = ref("Idle.");
const channelStatusTone = ref("info");
const channelProgress = ref(0);
const channelProgressVisible = ref(false);
const channelModalVisible = ref(false);
const channelModalTitle = ref("Working...");
const channelModalMessage = ref("Communicating with the radio.");
const channelSearch = ref("");
const channelTableWrap = ref(null);
const channelRowRefs = ref([]);

const channelsEditable = computed(() => channelsCanEdit.value && isConnected.value);

const channelMatchInfo = computed(() => {
  const termRaw = channelSearch.value.trim();
  const term = termRaw.length >= 3 ? termRaw.toLowerCase() : "";
  const flags = [];
  let matchCount = 0;
  let firstMatchIndex = null;
  channels.value.forEach((channel, index) => {
    const nameMatch = term && channel.name && channel.name.toLowerCase().includes(term);
    const freqMatch = term && formatFreq(channel.rxFreqHz).includes(term);
    const isMatch = Boolean(term && (nameMatch || freqMatch));
    flags.push(isMatch);
    if (isMatch) {
      matchCount += 1;
      if (firstMatchIndex === null) firstMatchIndex = index;
    }
  });
  return { term, flags, matchCount, firstMatchIndex };
});

const channelSearchCount = computed(() => {
  if (!channelMatchInfo.value.term) return "";
  return `${channelMatchInfo.value.matchCount} found`;
});

onBeforeUpdate(() => {
  channelRowRefs.value = [];
});

watch(
  () => channelMatchInfo.value.term,
  async () => {
    await nextTick();
    const firstIndex = channelMatchInfo.value.firstMatchIndex;
    if (firstIndex === null) return;
    const firstRow = channelRowRefs.value[firstIndex];
    const tableWrap = channelTableWrap.value;
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
);

const clearChannelSearch = () => {
  channelSearch.value = "";
};

const setChannelStatus = (message, tone = "info") => {
  channelStatus.value = message;
  channelStatusTone.value = tone;
};

const setChannelProgress = (value, visible = true) => {
  channelProgress.value = clampPercent(value);
  channelProgressVisible.value = visible;
};

const showChannelModal = (title, message) => {
  channelModalTitle.value = title;
  channelModalMessage.value = message;
  channelModalVisible.value = true;
  document.body.style.overflow = "hidden";
};

const hideChannelModal = () => {
  channelModalVisible.value = false;
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
  if (type === "CTCSS") return ctcssTones.indexOf(Number.parseFloat(value));
  if (type === "DCS" || type === "DCS-R") return dtcsCodes.indexOf(Number.parseInt(value, 10));
  return 0;
};

const getToneFlag = (type) => {
  if (type === "CTCSS") return 1;
  if (type === "DCS") return 2;
  if (type === "DCS-R") return 3;
  return 0;
};

const getToneValue = (type, code) => {
  if (type === "CTCSS") return ctcssTones[code] ?? "";
  if (type === "DCS" || type === "DCS-R") return dtcsCodes[code] ?? "";
  return "";
};

const toneOptions = (type) => {
  if (type === "CTCSS") return ctcssTones.map((tone) => tone.toFixed(1));
  if (type === "DCS" || type === "DCS-R") return dtcsCodes.map(String);
  return [];
};

const updateToneType = (index, field, value) => {
  const channel = channels.value[index];
  if (!channel) return;
  channel[field] = value;
  if (field === "rxToneType") {
    channel.rxTone = value === "CTCSS" ? ctcssTones[0].toFixed(1) : value.startsWith("DCS") ? dtcsCodes[0] : "";
  } else if (field === "txToneType") {
    channel.txTone = value === "CTCSS" ? ctcssTones[0].toFixed(1) : value.startsWith("DCS") ? dtcsCodes[0] : "";
  }
};

const updateChannelField = (index, field, rawValue) => {
  const channel = channels.value[index];
  if (!channel) return;
  if (field === "name") {
    const upper = String(rawValue || "").toUpperCase();
    channel.name = upper;
    return;
  }
  if (field === "rxFreq") {
    channel.rxFreqHz = parseFreq(rawValue);
    updateDuplexFromOffset(channel);
    return;
  }
  if (field === "duplex") {
    channel.duplex = rawValue;
    updateDuplexFromOffset(channel);
    return;
  }
  if (field === "offset") {
    const offset = Number.parseFloat(rawValue);
    channel.offsetHz = Number.isNaN(offset) ? 0 : Math.round(offset * 1_000_000);
    updateDuplexFromOffset(channel);
    return;
  }
  if (field === "step") {
    channel.step = Number.parseFloat(rawValue);
    return;
  }
  if (field === "scanlist") {
    channel.scanlist = Number.parseInt(rawValue, 10);
    return;
  }
  if (field === "reverse" || field === "busy" || field === "txLock") {
    channel[field] = Boolean(rawValue);
    return;
  }
  channel[field] = rawValue;
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
    channel.mode = modeList[tempMode] ?? (tempMode === 5 ? "USB" : "FM");

    const txpower = (flagsExtra >> 2) & 0x07;
    channel.power = powerList[txpower] ?? "USER";
    channel.reverse = Boolean(flagsExtra & 0x01);
    channel.busy = Boolean(flagsExtra & 0x20);
    channel.txLock = Boolean(flagsExtra & 0x40);

    channel.pttid = pttidList[(flagsDtmf >> 1) & 0x07] ?? "OFF";
    channel.dtmfDecode = Boolean(flagsDtmf & 0x01);

    channel.step = steps[step] ?? steps[0];
    channel.scrambler = scramblerList[scrambler] ?? "OFF";

    decoded.push(channel);
  }
  return decoded;
};

const encodeChannels = () => {
  const channelBytes = new Uint8Array(CHANNEL_COUNT * 16);
  const nameBytes = new Uint8Array(CHANNEL_COUNT * 16).fill(0xff);
  const attrBytes = new Uint8Array(CHANNEL_COUNT).fill(0x00);
  const view = new DataView(channelBytes.buffer);

  channels.value.forEach((channel, index) => {
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

    const modeIndex = modeList.indexOf(channel.mode);
    const modulation = modeIndex >= 0 ? Math.floor(modeIndex / 2) : 0;
    const bandwidth = modeIndex >= 0 ? modeIndex % 2 : 0;
    channelBytes[base + 11] = ((modulation & 0x0f) << 4) | (channel.offsetDir & 0x0f);

    const powerIndex = Math.max(0, powerList.indexOf(channel.power));
    let flagsExtra = 0;
    flagsExtra |= channel.reverse ? 0x01 : 0;
    flagsExtra |= (bandwidth & 0x01) << 1;
    flagsExtra |= (powerIndex & 0x07) << 2;
    flagsExtra |= channel.busy ? 0x20 : 0;
    flagsExtra |= channel.txLock ? 0x40 : 0;
    channelBytes[base + 12] = flagsExtra;

    let flagsDtmf = 0;
    const pttidIndex = Math.max(0, pttidList.indexOf(channel.pttid));
    flagsDtmf |= (pttidIndex & 0x07) << 1;
    flagsDtmf |= channel.dtmfDecode ? 0x01 : 0;
    channelBytes[base + 13] = flagsDtmf;

    const stepIndex = Math.max(0, steps.indexOf(channel.step));
    channelBytes[base + 14] = stepIndex;
    channelBytes[base + 15] = Math.max(0, scramblerList.indexOf(channel.scrambler));

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

const renumberChannels = () => {
  channels.value.forEach((channel, index) => {
    channel.number = index + 1;
  });
};

const removeChannel = (index) => {
  if (!channelsEditable.value) return;
  channels.value.splice(index, 1);
  channels.value.push(buildEmptyChannel(channels.value.length + 1));
  renumberChannels();
  setChannelStatus("Channel removed.");
};

const insertChannel = (index) => {
  if (!channelsEditable.value) return;
  channels.value.splice(index, 0, buildEmptyChannel(0));
  while (channels.value.length > CHANNEL_COUNT) {
    channels.value.pop();
  }
  renumberChannels();
  setChannelStatus("Blank channel inserted.");
};

const connectChannels = async () => {
  if (!claim("channels")) {
    channelsError.value = "Another tool is using the serial connection.";
    setChannelStatus("Another tool is using the serial connection.", "error");
    return;
  }
  channelsError.value = "";
  try {
    await connectSerial({ baudRate: Number(baud.value) });
    channelsError.value = "";
    setChannelStatus("Connected.");
  } catch (error) {
    const message = `Failed to connect: ${error.message || error}`;
    channelsError.value = message;
    setChannelStatus(message, "error");
  } finally {
    release("channels");
  }
};

const disconnectChannels = async () => {
  if (!claim("channels")) {
    channelsError.value = "Another tool is using the serial connection.";
    setChannelStatus("Another tool is using the serial connection.", "error");
    return;
  }
  channelsError.value = "";
  try {
    await disconnectSerial();
    channelsError.value = "";
    setChannelStatus("Disconnected.");
  } catch (error) {
    const message = `Failed to disconnect: ${error.message || error}`;
    channelsError.value = message;
    setChannelStatus(message, "error");
  } finally {
    release("channels");
  }
};

const readChannels = async () => {
  if (!isConnected.value) {
    setChannelStatus("Connect the radio first.", "error");
    return;
  }
  if (!claim("channels")) {
    setChannelStatus("Another tool is using the serial connection.", "error");
    return;
  }
  const port = getPort();
  if (!port) {
    setChannelStatus("No serial port available.", "error");
    release("channels");
    return;
  }
  channelsBusy.value = true;
  channelsCanEdit.value = false;
  setChannelProgress(0, true);
  setChannelStatus("Reading channels...");
  showChannelModal("Reading channels", "Please keep the radio connected.");
  try {
    await eepromInit(port);

    const totalReads = 3;
    let progressStep = 0;
    const updateProgress = () => {
      progressStep += 1;
      setChannelProgress((progressStep / totalReads) * 100, true);
    };

    const channelBytes = await readRange(0x0000, CHANNEL_COUNT * 16);
    updateProgress();
    const attrBytes = await readRange(0x0d60, CHANNEL_COUNT);
    updateProgress();
    const nameBytes = await readRange(0x0f50, CHANNEL_COUNT * 16);
    updateProgress();

    channels.value = decodeChannels(channelBytes, nameBytes, attrBytes);
    channelsCanEdit.value = true;
    setChannelStatus("Channels loaded.");
    setChannelProgress(100, true);
    setTimeout(() => {
      setChannelProgress(0, false);
      hideChannelModal();
    }, 800);
  } catch (error) {
    setChannelStatus(`Read failed: ${error.message}`, "error");
    setChannelProgress(0, false);
    channelsCanEdit.value = false;
    hideChannelModal();
  } finally {
    channelsBusy.value = false;
    release("channels");
  }
};

const writeChannels = async () => {
  if (!isConnected.value) {
    setChannelStatus("Connect the radio first.", "error");
    return;
  }
  if (!claim("channels")) {
    setChannelStatus("Another tool is using the serial connection.", "error");
    return;
  }
  if (!channelsCanEdit.value) {
    setChannelStatus("Read from the radio before editing.", "error");
    release("channels");
    return;
  }
  const port = getPort();
  if (!port) {
    setChannelStatus("No serial port available.", "error");
    release("channels");
    return;
  }
  channelsBusy.value = true;
  setChannelProgress(0, true);
  setChannelStatus("Writing channels...");
  showChannelModal("Writing channels", "Please keep the radio connected.");
  try {
    await eepromInit(port);

    const { channelBytes, nameBytes, attrBytes } = encodeChannels();
    const totalWrites = 3;
    let progressStep = 0;
    const updateProgress = () => {
      progressStep += 1;
      setChannelProgress((progressStep / totalWrites) * 100, true);
    };

    await writeRange(0x0000, channelBytes);
    updateProgress();
    await writeRange(0x0d60, attrBytes);
    updateProgress();
    await writeRange(0x0f50, nameBytes);
    updateProgress();

    await eepromReboot(port);
    setChannelStatus("Channels written successfully.");
    setChannelProgress(100, true);
    setTimeout(() => {
      setChannelProgress(0, false);
      hideChannelModal();
    }, 800);
  } catch (error) {
    setChannelStatus(`Write failed: ${error.message}`, "error");
    setChannelProgress(0, false);
    hideChannelModal();
  } finally {
    channelsBusy.value = false;
    release("channels");
  }
};

const exportCsv = () => {
  if (!channelsCanEdit.value) {
    setChannelStatus("Read from the radio before exporting.", "error");
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
  const rows = channels.value
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
      scanlistList[channel.scanlist] ?? "None",
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

const importCsvInput = ref(null);
const triggerImportCsv = () => {
  if (!channelsCanEdit.value) {
    setChannelStatus("Read from the radio before importing.", "error");
    return;
  }
  if (importCsvInput.value) {
    importCsvInput.value.value = "";
    importCsvInput.value.click();
  }
};

const handleImportCsv = async (event) => {
  if (!channelsCanEdit.value) {
    setChannelStatus("Read from the radio before importing.", "error");
    return;
  }
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  const dataLines = lines.slice(1);
  dataLines.forEach((line, idx) => {
    const columns = line.split(",");
    if (columns.length < 10) return;
    const channel = channels.value[idx];
    if (!channel) return;
    const name = (columns[1] ?? "").toUpperCase();
    channel.name = name;
    channel.rxFreqHz = parseFreq(columns[2]);
    channel.duplex = columns[3] ?? "";
    channel.offsetHz = Math.round((Number.parseFloat(columns[4]) || 0) * 1_000_000);
    channel.power = columns[5] ?? "USER";
    channel.mode = columns[6] ?? "FM";
    channel.rxToneType = columns[7] ?? "None";
    channel.rxTone = columns[8] ?? "";
    channel.txToneType = columns[9] ?? "None";
    channel.txTone = columns[10] ?? "";
    channel.step = Number.parseFloat(columns[11]) || steps[0];
    channel.reverse = columns[12] === "1";
    channel.busy = columns[13] === "1";
    channel.txLock = columns[14] === "1";
    channel.pttid = columns[15] ?? "OFF";
    channel.scanlist = Math.max(0, scanlistList.indexOf(columns[16]));
    updateDuplexFromOffset(channel);
  });
  setChannelStatus("CSV imported.");
};

const tooltip = reactive({ visible: false, text: "", x: 0, y: 0 });
const showTooltip = (event, text) => {
  if (!text) return;
  const rect = event.currentTarget.getBoundingClientRect();
  tooltip.text = text;
  tooltip.visible = true;
  tooltip.x = rect.left + rect.width / 2;
  tooltip.y = rect.top - 8;
};
const hideTooltip = () => {
  tooltip.visible = false;
};

const setLowList = ["< 20mW", "125mW", "250mW", "500mW", "1W", "2W", "5W"];
const setPttList = ["CLASSIC", "ONEPUSH"];
const setTotEotList = ["OFF", "SOUND", "VISUAL", "ALL"];
const setOffOnList = ["OFF", "ON"];
const setLckList = ["KEYS", "KEYS+PTT"];
const setMetList = ["TINY", "CLASSIC"];
const setNfmList = ["NARROW", "NARROWER"];
const rxModeList = ["MAIN ONLY", "DUAL RX RESPOND", "CROSS BAND", "MAIN TX DUAL RX"];
const batTxtList = ["NONE", "VOLTAGE", "PERCENT"];
const setOffTmrList = ["OFF"];
for (let h = 0; h < 2; h += 1) {
  if (h === 1) {
    setOffTmrList.push(`${h}h:00m`);
  }
  for (let m = 1; m < 60; m += 1) {
    setOffTmrList.push(`${h}h:${String(m).padStart(2, "0")}m`);
  }
}
setOffTmrList.push("2h:00m");
const backlightList = [
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
const backlightLevelList = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const backlightTxRxList = ["OFF", "TX", "RX", "TX/RX"];
const talkTimeList = [
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
const batSaveList = ["OFF", "1:1", "1:2", "1:3", "1:4", "1:5"];
const channelDispList = [
  "Frequency (FREQ)",
  "CHANNEL NUMBER",
  "NAME",
  "Name + Frequency (NAME + FREQ)",
];
const micGainList = ["+1.1dB", "+4.0dB", "+8.0dB", "+12.0dB", "+15.1dB"];
const rogerList = ["OFF", "Roger beep (ROGER)", "MDC data burst (MDC)"];
const rteList = [
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
const welcomeList = [
  "Message line 1, Voltage, Sound (ALL)",
  "Make 2 short sounds (SOUND)",
  "User message line 1 and line 2 (MESSAGE)",
  "Battery voltage (VOLTAGE)",
  "NONE",
];
const txVfoList = ["A", "B"];
const batteryTypeList = ["1600 mAh K5", "2200 mAh K5", "3500 mAh K5", "1400 mAh K1", "2500 mAh K1"];

const squelchList = Array.from({ length: 10 }, (_, i) => `${i}`);
const contrastList = Array.from({ length: 16 }, (_, i) => `${i}`);
const callChannelList = Array.from({ length: 200 }, (_, i) => `Channel M${i + 1}`);

const autoKeypadLockList = ["OFF"];
for (let s = 0; s <= 10; s += 1) {
  for (const ms of ["00s", "15s", "30s", "45s"]) {
    if (s === 0 && ms === "00s") continue;
    autoKeypadLockList.push(`${String(s).padStart(2, "0")}m:${ms}`);
  }
}

const scanResumeList = ["STOP : Stop scan when a signal is received"];
for (let s = 0; s < 20; s += 1) {
  const msList = s === 0 ? ["250ms", "500ms", "750ms"] : ["000ms", "250ms", "500ms", "750ms"];
  for (const ms of msList) {
    scanResumeList.push(
      `CARRIER ${String(s).padStart(2, "0")}s:${ms} : Listen for this time until the signal disappears`
    );
  }
}
scanResumeList.push("CARRIER 20s:000ms : Listen for this time until the signal disappears");
for (let m = 5; m <= 120; m += 5) {
  const minutes = Math.floor(m / 60);
  const seconds = m % 60;
  scanResumeList.push(
    `TIMEOUT ${String(minutes).padStart(2, "0")}m:${String(seconds).padStart(2, "0")}s : Listen for this time and resume`
  );
}

const settingsForm = reactive({
  setPwr: setLowList[0],
  setPtt: setPttList[0],
  setTot: setTotEotList[0],
  setEot: setTotEotList[0],
  setContrast: contrastList[0],
  setInv: setOffOnList[0],
  setLck: setLckList[0],
  setMet: setMetList[0],
  setGui: setMetList[0],
  setTmr: setOffOnList[0],
  setOff: setOffTmrList[0],
  setNfm: setNfmList[0],
  squelch: squelchList[0],
  rxMode: rxModeList[0],
  callChannel: callChannelList[0],
  autoKeypad: autoKeypadLockList[0],
  txTimeout: talkTimeList[0],
  batSave: batSaveList[0],
  batteryType: batteryTypeList[0],
  scanResume: scanResumeList[0],
  amFix: setOffOnList[0],
  batText: batTxtList[0],
  micBar: setOffOnList[0],
  chDisp: channelDispList[0],
  pOnMsg: welcomeList[0],
  backlightTime: backlightList[0],
  blMin: backlightLevelList[0],
  blMax: backlightLevelList[0],
  blTxRx: backlightTxRxList[0],
  micGain: micGainList[0],
  beep: setOffOnList[0],
  roger: rogerList[0],
  ste: setOffOnList[0],
  rpSte: rteList[0],
  txVfo: txVfoList[0],
  keypadLock: setOffOnList[0],
  logo1: "",
  logo2: "",
});

const settingsCanEdit = ref(false);
const settingsBusy = ref(false);
const settingsError = ref("");
const settingsStatus = ref("Idle.");
const settingsStatusTone = ref("info");
const settingsProgress = ref(0);
const settingsProgressVisible = ref(false);
const settingsModalVisible = ref(false);
const settingsModalTitle = ref("Working...");
const settingsModalMessage = ref("Communicating with the radio.");

const settingsEditable = computed(() => settingsCanEdit.value && isConnected.value);

const setSettingsStatus = (message, tone = "info") => {
  settingsStatus.value = message;
  settingsStatusTone.value = tone;
};

const setSettingsProgress = (value, visible = true) => {
  settingsProgress.value = clampPercent(value);
  settingsProgressVisible.value = visible;
};

const showSettingsModal = (title, message) => {
  settingsModalTitle.value = title;
  settingsModalMessage.value = message;
  settingsModalVisible.value = true;
  document.body.style.overflow = "hidden";
};

const hideSettingsModal = () => {
  settingsModalVisible.value = false;
  document.body.style.overflow = "";
};

const selectValue = (list, index) => {
  if (!list || !list.length) return "";
  const safeIndex = index >= 0 && index < list.length ? index : 0;
  return list[safeIndex];
};

const selectIndex = (list, value) => {
  if (!list || !list.length) return 0;
  const index = list.indexOf(value);
  return index < 0 ? 0 : index;
};

const connectSettings = async () => {
  if (!claim("settings")) {
    settingsError.value = "Another tool is using the serial connection.";
    setSettingsStatus("Another tool is using the serial connection.", "error");
    return;
  }
  settingsError.value = "";
  try {
    await connectSerial({ baudRate: Number(baud.value) });
    settingsError.value = "";
    setSettingsStatus("Connected.");
  } catch (error) {
    const message = `Failed to connect: ${error.message || error}`;
    settingsError.value = message;
    setSettingsStatus(message, "error");
  } finally {
    release("settings");
  }
};

const disconnectSettings = async () => {
  if (!claim("settings")) {
    settingsError.value = "Another tool is using the serial connection.";
    setSettingsStatus("Another tool is using the serial connection.", "error");
    return;
  }
  settingsError.value = "";
  try {
    await disconnectSerial();
    settingsError.value = "";
    setSettingsStatus("Disconnected.");
  } catch (error) {
    const message = `Failed to disconnect: ${error.message || error}`;
    settingsError.value = message;
    setSettingsStatus(message, "error");
  } finally {
    release("settings");
  }
};

const readSettings = async () => {
  if (!isConnected.value) {
    setSettingsStatus("Connect the radio first.", "error");
    return;
  }
  if (!claim("settings")) {
    setSettingsStatus("Another tool is using the serial connection.", "error");
    return;
  }
  const port = getPort();
  if (!port) {
    setSettingsStatus("No serial port available.", "error");
    release("settings");
    return;
  }
  settingsBusy.value = true;
  settingsCanEdit.value = false;
  setSettingsProgress(0, true);
  setSettingsStatus("Reading settings...");
  showSettingsModal("Reading settings", "Please keep the radio connected.");

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

    setSettingsProgress(40, true);

    settingsForm.callChannel = selectValue(callChannelList, blockE70[0]);
    settingsForm.squelch = selectValue(squelchList, Math.max(0, blockE70[1]));
    settingsForm.txTimeout = selectValue(talkTimeList, blockE70[2]);

    const keyByte = blockE70[4];
    const keyLock = (keyByte >> 7) & 0x01;
    settingsForm.keypadLock = selectValue(setOffOnList, keyLock);

    settingsForm.micGain = selectValue(micGainList, blockE70[7]);
    const blMin = blockE70[8] & 0x0f;
    const blMax = (blockE70[8] >> 4) & 0x0f;
    settingsForm.blMin = selectValue(backlightLevelList, blMin);
    settingsForm.blMax = selectValue(backlightLevelList, blMax);

    settingsForm.chDisp = selectValue(channelDispList, blockE70[9]);
    const rxModeIndex = ((blockE70[10] ? 1 : 0) << 1) + (blockE70[12] ? 1 : 0);
    settingsForm.rxMode = selectValue(rxModeList, rxModeIndex);
    settingsForm.batSave = selectValue(batSaveList, blockE70[11]);
    settingsForm.backlightTime = selectValue(backlightList, blockE70[13]);

    const nfmSteByte = blockE70[14];
    settingsForm.setNfm = selectValue(setNfmList, (nfmSteByte >> 1) & 0x03);
    settingsForm.ste = selectValue(setOffOnList, nfmSteByte & 0x01);

    const beepByte = blockE90[0];
    settingsForm.beep = selectValue(setOffOnList, (beepByte >> 7) & 0x01);
    settingsForm.scanResume = selectValue(scanResumeList, blockE90[5]);
    settingsForm.autoKeypad = selectValue(autoKeypadLockList, blockE90[6]);
    settingsForm.pOnMsg = selectValue(welcomeList, blockE90[7]);

    settingsForm.roger = selectValue(rogerList, blockEA8[1]);
    settingsForm.rpSte = selectValue(rteList, blockEA8[2]);
    settingsForm.txVfo = selectValue(txVfoList, blockEA8[3]);
    settingsForm.batteryType = selectValue(batteryTypeList, blockEA8[4]);

    const f40Byte = blockF40[7];
    settingsForm.blTxRx = selectValue(backlightTxRxList, f40Byte & 0x03);
    settingsForm.amFix = selectValue(setOffOnList, (f40Byte >> 2) & 0x01);
    settingsForm.micBar = selectValue(setOffOnList, (f40Byte >> 3) & 0x01);
    settingsForm.batText = selectValue(batTxtList, (f40Byte >> 4) & 0x03);

    const setOffByte = block1FF2[2];
    const setGuiByte = block1FF2[3];
    const setTotByte = block1FF2[4];
    const setPwrByte = block1FF2[5];

    settingsForm.setOff = selectValue(setOffTmrList, setOffByte & 0x7f);
    settingsForm.setTmr = selectValue(setOffOnList, (setOffByte >> 7) & 0x01);
    settingsForm.setGui = selectValue(setMetList, setGuiByte & 0x01);
    settingsForm.setMet = selectValue(setMetList, (setGuiByte >> 1) & 0x01);
    settingsForm.setLck = selectValue(setLckList, (setGuiByte >> 2) & 0x01);
    settingsForm.setInv = selectValue(setOffOnList, (setGuiByte >> 3) & 0x01);
    settingsForm.setContrast = selectValue(contrastList, (setGuiByte >> 4) & 0x0f);
    settingsForm.setTot = selectValue(setTotEotList, setTotByte & 0x0f);
    settingsForm.setEot = selectValue(setTotEotList, (setTotByte >> 4) & 0x0f);
    settingsForm.setPwr = selectValue(setLowList, setPwrByte & 0x0f);
    settingsForm.setPtt = selectValue(setPttList, (setPwrByte >> 4) & 0x0f);

    const logo1 = new TextDecoder().decode(blockEB0.slice(0, 16)).split("\x00")[0].trim();
    const logo2 = new TextDecoder().decode(blockEB0.slice(16, 32)).split("\x00")[0].trim();
    settingsForm.logo1 = logo1;
    settingsForm.logo2 = logo2;

    setSettingsProgress(100, true);
    setSettingsStatus("Settings loaded.");
    settingsCanEdit.value = true;
    setTimeout(() => {
      setSettingsProgress(0, false);
      hideSettingsModal();
    }, 800);
  } catch (error) {
    setSettingsStatus(`Read failed: ${error.message}`, "error");
    setSettingsProgress(0, false);
    settingsCanEdit.value = false;
    hideSettingsModal();
  } finally {
    settingsBusy.value = false;
    release("settings");
  }
};

const writeSettings = async () => {
  if (!isConnected.value) {
    setSettingsStatus("Connect the radio first.", "error");
    return;
  }
  if (!claim("settings")) {
    setSettingsStatus("Another tool is using the serial connection.", "error");
    return;
  }
  if (!settingsCanEdit.value) {
    setSettingsStatus("Read from the radio before editing.", "error");
    release("settings");
    return;
  }
  const port = getPort();
  if (!port) {
    setSettingsStatus("No serial port available.", "error");
    release("settings");
    return;
  }
  settingsBusy.value = true;
  settingsCanEdit.value = false;
  setSettingsProgress(0, true);
  setSettingsStatus("Writing settings...");
  showSettingsModal("Writing settings", "Please keep the radio connected.");

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

    blockE70[0] = selectIndex(callChannelList, settingsForm.callChannel);
    blockE70[1] = selectIndex(squelchList, settingsForm.squelch);
    blockE70[2] = selectIndex(talkTimeList, settingsForm.txTimeout);
    blockE70[7] = selectIndex(micGainList, settingsForm.micGain);
    blockE70[8] =
      (selectIndex(backlightLevelList, settingsForm.blMax) << 4) |
      selectIndex(backlightLevelList, settingsForm.blMin);
    blockE70[9] = selectIndex(channelDispList, settingsForm.chDisp);

    const rxModeIndex = selectIndex(rxModeList, settingsForm.rxMode);
    blockE70[10] = (rxModeIndex & 0x02) ? 1 : 0;
    blockE70[12] = (rxModeIndex & 0x01) ? 1 : 0;
    blockE70[11] = selectIndex(batSaveList, settingsForm.batSave);
    blockE70[13] = selectIndex(backlightList, settingsForm.backlightTime);

    const nfm = selectIndex(setNfmList, settingsForm.setNfm);
    const ste = selectIndex(setOffOnList, settingsForm.ste);
    blockE70[14] = ((nfm & 0x03) << 1) | (ste & 0x01);

    blockE70[4] = (blockE70[4] & 0x7f) | (selectIndex(setOffOnList, settingsForm.keypadLock) << 7);

    blockE90[0] = (blockE90[0] & 0x7f) | (selectIndex(setOffOnList, settingsForm.beep) << 7);
    blockE90[5] = selectIndex(scanResumeList, settingsForm.scanResume);
    blockE90[6] = selectIndex(autoKeypadLockList, settingsForm.autoKeypad);
    blockE90[7] = selectIndex(welcomeList, settingsForm.pOnMsg);

    blockEA8[1] = selectIndex(rogerList, settingsForm.roger);
    blockEA8[2] = selectIndex(rteList, settingsForm.rpSte);
    blockEA8[3] = selectIndex(txVfoList, settingsForm.txVfo);
    blockEA8[4] = selectIndex(batteryTypeList, settingsForm.batteryType);

    const f40Value =
      (selectIndex(backlightTxRxList, settingsForm.blTxRx) & 0x03) |
      ((selectIndex(setOffOnList, settingsForm.amFix) & 0x01) << 2) |
      ((selectIndex(setOffOnList, settingsForm.micBar) & 0x01) << 3) |
      ((selectIndex(batTxtList, settingsForm.batText) & 0x03) << 4);
    blockF40[7] = f40Value;

    const setOff = selectIndex(setOffTmrList, settingsForm.setOff);
    const setTmr = selectIndex(setOffOnList, settingsForm.setTmr);
    block1FF2[2] = (setOff & 0x7f) | ((setTmr & 0x01) << 7);

    const setGui = selectIndex(setMetList, settingsForm.setGui);
    const setMet = selectIndex(setMetList, settingsForm.setMet);
    const setLck = selectIndex(setLckList, settingsForm.setLck);
    const setInv = selectIndex(setOffOnList, settingsForm.setInv);
    const setContrast = selectIndex(contrastList, settingsForm.setContrast);
    block1FF2[3] =
      (setGui & 0x01) |
      ((setMet & 0x01) << 1) |
      ((setLck & 0x01) << 2) |
      ((setInv & 0x01) << 3) |
      ((setContrast & 0x0f) << 4);

    const setTot = selectIndex(setTotEotList, settingsForm.setTot);
    const setEot = selectIndex(setTotEotList, settingsForm.setEot);
    block1FF2[4] = (setTot & 0x0f) | ((setEot & 0x0f) << 4);

    const setPwr = selectIndex(setLowList, settingsForm.setPwr);
    const setPtt = selectIndex(setPttList, settingsForm.setPtt);
    block1FF2[5] = (setPwr & 0x0f) | ((setPtt & 0x0f) << 4);

    const logo1 = settingsForm.logo1.padEnd(16, "\x00").slice(0, 16);
    const logo2 = settingsForm.logo2.padEnd(16, "\x00").slice(0, 16);
    blockEB0.set(new TextEncoder().encode(logo1), 0);
    blockEB0.set(new TextEncoder().encode(logo2), 16);

    setSettingsProgress(50, true);

    await writeRange(0x0e70, blockE70);
    await writeRange(0x0e80, blockE80);
    await writeRange(0x0e90, blockE90);
    await writeRange(0x0ea0, blockEA0);
    await writeRange(0x0ea8, blockEA8);
    await writeRange(0x0eb0, blockEB0);
    await writeRange(0x0f40, blockF40);
    await writeRange(0x1ff2, block1FF2);
    await eepromReboot(port);

    setSettingsProgress(100, true);
    setSettingsStatus("Settings written successfully.");
    setTimeout(() => {
      setSettingsProgress(0, false);
      hideSettingsModal();
    }, 800);
  } catch (error) {
    setSettingsStatus(`Write failed: ${error.message}`, "error");
    setSettingsProgress(0, false);
    hideSettingsModal();
  } finally {
    settingsBusy.value = false;
    release("settings");
  }
};

const lcdSizeX = 128;
const lcdSizeY = 64;
const pixelSize = 3;
const gapSize = 1;
const pixelColor = "#06080c";

const mirrorCanvasRef = ref(null);
const mirrorShellRef = ref(null);
const mirrorContext = ref(null);
const mirrorError = ref("");
const mirrorStatusTitle = ref("Disconnected");
const mirrorStatusSubtitle = ref("No serial port selected.");
const mirrorColor = ref("amber");
const mirrorIsStreaming = ref(false);
const mirrorIsReading = ref(false);
const mirrorIsAttached = ref(false);
const mirrorStopPending = ref(false);
let mirrorReader = null;
let mirrorSerialBuffer = new Uint8Array();

const mirrorToggleLabel = computed(() => (mirrorIsStreaming.value ? "Stop" : "Start"));
const mirrorToggleIconPath = computed(() =>
  mirrorIsStreaming.value ? "M6 6h12v12H6z" : "M5 5l14 7-14 7z"
);

const setMirrorStatus = (connected, title, subtitle) => {
  mirrorStatusTitle.value = title;
  mirrorStatusSubtitle.value = subtitle;
};

const drawPixel = (x, y, isOn) => {
  const context = mirrorContext.value;
  if (!context) return;
  context.globalAlpha = isOn ? 1 : 0.08;
  context.fillStyle = pixelColor;
  context.clearRect(x * (pixelSize + gapSize) + 1, y * (pixelSize + gapSize) + 1, pixelSize, pixelSize);
  context.fillRect(x * (pixelSize + gapSize) + 1, y * (pixelSize + gapSize) + 1, pixelSize, pixelSize);
  context.globalAlpha = 1;
};

const clearCanvas = (initPixels) => {
  const context = mirrorContext.value;
  if (!context || !mirrorCanvasRef.value) return;
  if (!initPixels) return;
  for (let y = 0; y < lcdSizeY; y += 1) {
    for (let x = 0; x < lcdSizeX; x += 1) {
      drawPixel(x, y, false);
    }
  }
};

const updateDisplay = (displayArray) => {
  const context = mirrorContext.value;
  if (!context || !displayArray) return;
  for (let a = 0; a < lcdSizeX; a += 1) {
    for (let b = 0; b < 8; b += 1) {
      const binaryString = displayArray[a + b * lcdSizeX]
        .toString(2)
        .padStart(8, "0")
        .split("")
        .reverse();
      for (let i = 0; i < 8; i += 1) {
        drawPixel(a, i + b * 8, binaryString[i] === "1");
      }
    }
  }
};

const updateStatusDisplay = (displayArray) => {
  const context = mirrorContext.value;
  if (!context || !displayArray) return;
  const b = 0;
  for (let a = 0; a < lcdSizeX; a += 1) {
    const binaryString = displayArray[a + b * lcdSizeX]
      .toString(2)
      .padStart(8, "0")
      .split("")
      .reverse();
    for (let i = 0; i < 8; i += 1) {
      drawPixel(a, i + b * 8, binaryString[i] === "1");
    }
  }
};

const processMirrorSerialBuffer = () => {
  while (mirrorSerialBuffer.length > 0 && mirrorSerialBuffer[0] !== 0xab) {
    mirrorSerialBuffer = mirrorSerialBuffer.slice(1);
  }

  while (mirrorSerialBuffer.length >= 2 && mirrorSerialBuffer[0] === 0xab) {
    if (mirrorSerialBuffer[1] === 0xee) {
      const payloadLength = 128 + 2;
      if (mirrorSerialBuffer.length < payloadLength) return;
      const packet = mirrorSerialBuffer.slice(2, payloadLength);
      updateStatusDisplay(packet);
      mirrorSerialBuffer = mirrorSerialBuffer.slice(payloadLength);
      continue;
    }

    if (mirrorSerialBuffer[1] === 0xed) {
      const payloadLength = 1024 + 2;
      if (mirrorSerialBuffer.length < payloadLength) return;
      const packet = mirrorSerialBuffer.slice(2, payloadLength);
      updateDisplay(packet);
      mirrorSerialBuffer = mirrorSerialBuffer.slice(payloadLength);
      continue;
    }

    if (mirrorSerialBuffer.length >= 4 && mirrorSerialBuffer[1] === 0xcd) {
      const payloadLength = mirrorSerialBuffer[2] + (mirrorSerialBuffer[3] << 8);
      const totalPacketLength = payloadLength + 8;
      if (mirrorSerialBuffer.length < totalPacketLength) return;
      mirrorSerialBuffer = mirrorSerialBuffer.slice(totalPacketLength);
      continue;
    }

    return;
  }
};

const startMirrorReader = async () => {
  const port = serialState.port;
  if (!port || !port.readable || mirrorIsReading.value) return;
  mirrorReader = port.readable.getReader();
  mirrorIsReading.value = true;
  try {
    while (mirrorIsReading.value) {
      const { value, done } = await mirrorReader.read();
      if (done) break;
      if (!value) continue;
      mirrorSerialBuffer = new Uint8Array([...mirrorSerialBuffer, ...value]);
      processMirrorSerialBuffer();
    }
  } catch (error) {
    if (mirrorIsReading.value) {
      mirrorError.value = `Serial read error: ${error.message || error}`;
    }
  } finally {
    mirrorIsReading.value = false;
    if (mirrorReader) {
      try {
        mirrorReader.releaseLock();
      } catch {
        // Ignore release errors.
      }
    }
  }
};

const stopMirrorReader = async () => {
  mirrorIsReading.value = false;
  if (mirrorReader) {
    try {
      await mirrorReader.cancel();
    } catch {
      // Ignore cancel errors.
    }
  }
  mirrorReader = null;
};

const startMirror = async () => {
  const port = serialState.port;
  if (!port) return;
  try {
    const packet = new Uint8Array([0x03, 0x0a, 0xff, 0xff, 0xff, 0xff]);
    await sendPacket(port, packet);
    mirrorIsStreaming.value = true;
    setMirrorStatus(true, "Connected", "Streaming display data.");
  } catch (error) {
    mirrorError.value = `Failed to start mirror: ${error.message || error}`;
  }
};

const stopMirror = async () => {
  const port = serialState.port;
  if (!port || mirrorStopPending.value) return;
  mirrorStopPending.value = true;
  try {
    const packet = new Uint8Array([0x04, 0x0a, 0xff, 0xff, 0xff, 0xff]);
    await sendPacket(port, packet);
  } catch (error) {
    mirrorError.value = `Failed to stop mirror: ${error.message || error}`;
  } finally {
    mirrorIsStreaming.value = false;
    mirrorStopPending.value = false;
    if (serialState.connected) {
      setMirrorStatus(true, "Connected", "Mirror stopped.");
    }
  }
};

const updateMirrorAttachment = () => {
  const shouldAttach = serialState.connected && activePage.value === "mirror";
  if (shouldAttach === mirrorIsAttached.value) {
    if (mirrorIsAttached.value) {
      if (serialState.refreshingFirmware) {
        if (mirrorIsReading.value) stopMirrorReader();
        setMirrorStatus(true, "Connected", "Reading firmware...");
      } else if (!mirrorIsReading.value) {
        startMirrorReader();
        setMirrorStatus(true, "Connected", mirrorIsStreaming.value ? "Streaming display data." : "Ready to start the mirror.");
      }
    }
    return;
  }
  mirrorIsAttached.value = shouldAttach;
  if (mirrorIsAttached.value) {
    mirrorSerialBuffer = new Uint8Array();
    if (serialState.refreshingFirmware) {
      setMirrorStatus(true, "Connected", "Reading firmware...");
    } else {
      startMirrorReader();
      setMirrorStatus(true, "Connected", mirrorIsStreaming.value ? "Streaming display data." : "Ready to start the mirror.");
    }
  } else {
    if (mirrorIsStreaming.value) {
      stopMirror();
    }
    stopMirrorReader();
    clearCanvas(true);
    setMirrorStatus(
      serialState.connected,
      serialState.connected ? "Connected" : "Disconnected",
      serialState.connected ? "Mirror idle." : "No serial port selected."
    );
  }
};

const toggleMirror = async () => {
  if (mirrorIsStreaming.value) {
    await stopMirror();
  } else {
    await startMirror();
  }
};

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const saveScreenshot = () => {
  const canvas = mirrorCanvasRef.value;
  const shell = mirrorShellRef.value;
  if (!canvas || !shell) return;

  const shellStyles = getComputedStyle(shell);
  const padding = parseFloat(shellStyles.padding) || 0;
  const borderWidth = parseFloat(shellStyles.borderTopWidth) || 0;
  const radius = parseFloat(shellStyles.borderRadius) || 0;

  const scaleX = canvas.offsetWidth ? canvas.width / canvas.offsetWidth : 1;
  const scaleY = canvas.offsetHeight ? canvas.height / canvas.offsetHeight : 1;
  const shellWidth = Math.round(shell.offsetWidth * scaleX);
  const shellHeight = Math.round(shell.offsetHeight * scaleY);
  const padX = padding * scaleX;
  const padY = padding * scaleY;
  const borderX = borderWidth * scaleX;
  const borderY = borderWidth * scaleY;

  const temp = document.createElement("canvas");
  temp.width = shellWidth;
  temp.height = shellHeight;
  const tempContext = temp.getContext("2d");
  if (!tempContext) return;

  const isAmber = mirrorColor.value === "amber";
  const angle = (160 * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const centerX = shellWidth / 2;
  const centerY = shellHeight / 2;
  const gradientLength = Math.abs(shellWidth * dx) + Math.abs(shellHeight * dy);
  const gradient = tempContext.createLinearGradient(
    centerX - (dx * gradientLength) / 2,
    centerY - (dy * gradientLength) / 2,
    centerX + (dx * gradientLength) / 2,
    centerY + (dy * gradientLength) / 2
  );
  if (isAmber) {
    gradient.addColorStop(0, "#ffb45e");
    gradient.addColorStop(1, "#e07f2a");
  } else {
    gradient.addColorStop(0, "#f3f7ff");
    gradient.addColorStop(1, "#cfdcff");
  }

  drawRoundedRect(tempContext, 0, 0, shellWidth, shellHeight, radius * scaleX);
  tempContext.fillStyle = gradient;
  tempContext.fill();

  if (borderWidth > 0) {
    tempContext.lineWidth = borderWidth * scaleX;
    tempContext.strokeStyle = shellStyles.borderTopColor;
    tempContext.stroke();
  }

  const shadow = tempContext.createRadialGradient(
    shellWidth / 2,
    shellHeight / 2,
    Math.min(shellWidth, shellHeight) * 0.15,
    shellWidth / 2,
    shellHeight / 2,
    Math.min(shellWidth, shellHeight) * 0.6
  );
  shadow.addColorStop(0, "rgba(0, 0, 0, 0)");
  shadow.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  tempContext.save();
  drawRoundedRect(tempContext, 0, 0, shellWidth, shellHeight, radius * scaleX);
  tempContext.clip();
  tempContext.fillStyle = shadow;
  tempContext.fillRect(0, 0, shellWidth, shellHeight);
  tempContext.restore();

  const contentX = padX + borderX;
  const contentY = padY + borderY;
  const contentWidth = shellWidth - contentX * 2;
  const contentHeight = shellHeight - contentY * 2;
  tempContext.drawImage(canvas, contentX, contentY, contentWidth, contentHeight);

  const link = document.createElement("a");
  link.download = "uv-k5-screenshot.png";
  link.href = temp.toDataURL("image/png").replace("image/png", "image/octet-stream");
  link.click();
};

const connectMirror = async () => {
  if (!claim("mirror")) {
    mirrorError.value = "Another tool is using the serial connection.";
    return;
  }
  mirrorError.value = "";
  try {
    await connectSerial({ baudRate: Number(baud.value) });
  } catch (error) {
    mirrorError.value = `Failed to connect: ${error.message || error}`;
  } finally {
    release("mirror");
  }
};

const disconnectMirror = async () => {
  if (!claim("mirror")) {
    mirrorError.value = "Another tool is using the serial connection.";
    return;
  }
  mirrorError.value = "";
  try {
    if (mirrorIsStreaming.value) {
      await stopMirror();
    }
    await stopMirrorReader();
    await disconnectSerial();
  } catch (error) {
    mirrorError.value = `Failed to disconnect: ${error.message || error}`;
  } finally {
    release("mirror");
  }
};

const smrError = ref("");
const smrStatusTitle = ref("Disconnected");
const smrStatusSubtitle = ref("No serial port selected.");
const smrIsAttached = ref(false);
const smrIsReading = ref(false);
const smrLog = ref([]);
const smrMessage = ref("");
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let smrReader = null;
let smrTextBuffer = "";

const MAX_SMS_LENGTH = 30;

const smrRemaining = computed(() => {
  const normalized = (smrMessage.value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return Math.max(0, MAX_SMS_LENGTH - normalized.length);
});

const setSmrStatus = (connected, title, subtitle) => {
  smrStatusTitle.value = title;
  smrStatusSubtitle.value = subtitle;
};

const appendSmrMessage = (message, direction = "system", label = "SYS") => {
  const entry = {
    id: `${Date.now()}-${Math.random()}`,
    message: message || "",
    direction: direction === "system" ? null : direction,
    tone: direction === "system" ? "system" : null,
    label,
    meta: "",
    ack: false,
  };
  smrLog.value.push(entry);
  nextTick(() => {
    const logEl = document.getElementById("smsLog");
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });
  return entry;
};

const markLastSentReceived = (stationId = "") => {
  const last = [...smrLog.value].reverse().find((entry) => entry.direction === "out");
  if (!last) return;
  last.ack = true;
  last.meta = stationId || "OK";
};

const handleSmrLine = (line) => {
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
      appendSmrMessage(message, "in", stationId || "SMS<");
      return;
    }
  }
  if (trimmed.startsWith("SMS<")) {
    const message = trimmed.slice(4).trimStart();
    appendSmrMessage(message, "in", "SMS<");
    return;
  }
  if (trimmed.startsWith("SMS>")) {
    const message = trimmed.slice(4).trimStart();
    appendSmrMessage(message, "out", "SMS>");
    return;
  }
  appendSmrMessage(trimmed, "system", "SYS");
};

const flushSmrLines = () => {
  let newlineIndex = smrTextBuffer.indexOf("\n");
  while (newlineIndex !== -1) {
    let line = smrTextBuffer.slice(0, newlineIndex);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    smrTextBuffer = smrTextBuffer.slice(newlineIndex + 1);
    handleSmrLine(line);
    newlineIndex = smrTextBuffer.indexOf("\n");
  }
};

const startSmrReader = async () => {
  const port = serialState.port;
  if (!port || !port.readable || smrIsReading.value) return;
  smrReader = port.readable.getReader();
  smrIsReading.value = true;
  try {
    while (smrIsReading.value) {
      const { value, done } = await smrReader.read();
      if (done) break;
      if (!value) continue;
      smrTextBuffer += decoder.decode(value, { stream: true });
      flushSmrLines();
    }
  } catch (error) {
    if (smrIsReading.value) {
      smrError.value = `Serial read error: ${error.message || error}`;
    }
  } finally {
    smrIsReading.value = false;
    if (smrReader) {
      try {
        smrReader.releaseLock();
      } catch {
        // Ignore release errors.
      }
    }
  }
};

const stopSmrReader = async () => {
  smrIsReading.value = false;
  if (smrReader) {
    try {
      await smrReader.cancel();
    } catch {
      // Ignore cancel errors.
    }
  }
  smrReader = null;
};

const updateSmrAttachment = () => {
  const shouldAttach = serialState.connected && activePage.value === "smr";
  if (shouldAttach === smrIsAttached.value) {
    if (smrIsAttached.value) {
      if (serialState.refreshingFirmware) {
        if (smrIsReading.value) stopSmrReader();
        setSmrStatus(true, "Connected", "Reading firmware...");
      } else if (!smrIsReading.value) {
        startSmrReader();
        setSmrStatus(true, "Connected", "Ready to exchange SMS frames.");
      }
    }
    return;
  }
  smrIsAttached.value = shouldAttach;
  if (smrIsAttached.value) {
    smrTextBuffer = "";
    if (serialState.refreshingFirmware) {
      setSmrStatus(true, "Connected", "Reading firmware...");
    } else {
      startSmrReader();
      setSmrStatus(true, "Connected", "Ready to exchange SMS frames.");
    }
  } else {
    stopSmrReader();
    setSmrStatus(
      serialState.connected,
      serialState.connected ? "Connected" : "Disconnected",
      serialState.connected ? "SMR idle." : "No serial port selected."
    );
  }
};

const sendSmrMessage = async () => {
  const port = serialState.port;
  if (!port || !port.writable) return;
  const raw = smrMessage.value.trim();
  if (!raw) return;
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.length > MAX_SMS_LENGTH) {
    smrError.value = `Message must be ${MAX_SMS_LENGTH} characters or less.`;
    return;
  }
  smrError.value = "";
  const message = normalized.toUpperCase();
  const payload = `SMS:${message}\r\n`;
  const writer = port.writable.getWriter();
  try {
    await writer.write(encoder.encode(payload));
    smrMessage.value = "";
  } catch (error) {
    smrError.value = `Failed to send SMS: ${error.message || error}`;
  } finally {
    writer.releaseLock();
  }
};

const clearSmrLog = () => {
  smrLog.value = [];
};

const connectSmr = async () => {
  if (!claim("smr")) {
    smrError.value = "Another tool is using the serial connection.";
    return;
  }
  smrError.value = "";
  try {
    await connectSerial({ baudRate: Number(baud.value) });
  } catch (error) {
    smrError.value = `Failed to connect: ${error.message || error}`;
  } finally {
    release("smr");
  }
};

const disconnectSmr = async () => {
  if (!claim("smr")) {
    smrError.value = "Another tool is using the serial connection.";
    return;
  }
  smrError.value = "";
  try {
    await stopSmrReader();
    await disconnectSerial();
  } catch (error) {
    smrError.value = `Failed to disconnect: ${error.message || error}`;
  } finally {
    release("smr");
  }
};

const appState = {
  activePage,
  currentYear,
  isConnected,
  deviceInfoText,
  baud,
  firmwareLabel,
  homeError,
  connectHome,
  disconnectHome,
  backupIncludeCal,
  backupEeprom,
  backupProgress,
  backupProgressVisible,
  restoreIncludeCal,
  restoreEeprom,
  restoreProgress,
  restoreProgressVisible,
  firmwareSource,
  useGithubFirmware,
  firmwareFileInput,
  restoreFileInput,
  flashFirmware,
  flashProgress,
  flashProgressVisible,
  logEntries,
  clearLog,
  formatPercent,
  channelsBusy,
  channelsCanEdit,
  channelsError,
  channelStatus,
  channelStatusTone,
  channelProgress,
  channelProgressVisible,
  channelModalVisible,
  channelModalTitle,
  channelModalMessage,
  channelSearch,
  channelSearchCount,
  channelMatchInfo,
  channelsEditable,
  channels,
  channelRowRefs,
  channelTableWrap,
  powerList,
  modeList,
  toneTypeList,
  steps,
  scanlistList,
  pttidList,
  formatFreq,
  formatOffset,
  updateChannelField,
  updateToneType,
  toneOptions,
  readChannels,
  writeChannels,
  exportCsv,
  triggerImportCsv,
  handleImportCsv,
  importCsvInput,
  insertChannel,
  removeChannel,
  clearChannelSearch,
  showTooltip,
  hideTooltip,
  settingsError,
  settingsStatus,
  settingsStatusTone,
  settingsProgress,
  settingsProgressVisible,
  settingsModalVisible,
  settingsModalTitle,
  settingsModalMessage,
  settingsForm,
  settingsEditable,
  settingsCanEdit,
  settingsBusy,
  readSettings,
  writeSettings,
  connectSettings,
  disconnectSettings,
  setLowList,
  setPttList,
  setTotEotList,
  setOffOnList,
  setLckList,
  setMetList,
  setNfmList,
  squelchList,
  rxModeList,
  callChannelList,
  autoKeypadLockList,
  talkTimeList,
  batSaveList,
  batteryTypeList,
  scanResumeList,
  batTxtList,
  micGainList,
  rogerList,
  rteList,
  welcomeList,
  channelDispList,
  backlightList,
  backlightLevelList,
  backlightTxRxList,
  txVfoList,
  contrastList,
  mirrorError,
  mirrorStatusTitle,
  mirrorStatusSubtitle,
  mirrorColor,
  mirrorIsAttached,
  mirrorToggleLabel,
  mirrorToggleIconPath,
  toggleMirror,
  connectMirror,
  disconnectMirror,
  saveScreenshot,
  mirrorCanvasRef,
  mirrorShellRef,
  smrError,
  smrStatusTitle,
  smrStatusSubtitle,
  smrIsAttached,
  smrLog,
  smrMessage,
  smrRemaining,
  sendSmrMessage,
  clearSmrLog,
  connectSmr,
  disconnectSmr,
  tooltip,
};

provide(AppStateKey, appState);

let unsubscribe = null;
const handleSerialState = (state) => {
  serialState.port = state.port;
  serialState.connected = state.connected;
  serialState.baudRate = state.baudRate;
  serialState.firmwareVersion = state.firmwareVersion;
  serialState.refreshingFirmware = state.refreshingFirmware;
  serialState.activeClient = state.activeClient;
  if (state.baudRate) {
    baud.value = String(state.baudRate);
  }
  if (!state.connected) {
    channelsCanEdit.value = false;
    settingsCanEdit.value = false;
  }
  updateMirrorAttachment();
  updateSmrAttachment();
};

onMounted(() => {
  syncPageFromHash();
  window.addEventListener("hashchange", syncPageFromHash);
  unsubscribe = subscribe(handleSerialState);
  if (mirrorCanvasRef.value) {
    mirrorContext.value = mirrorCanvasRef.value.getContext("2d");
    clearCanvas(true);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("hashchange", syncPageFromHash);
  if (unsubscribe) unsubscribe();
  stopMirrorReader();
  stopSmrReader();
});

watch(activePage, () => {
  updatePageMeta(activePage.value);
  updateMirrorAttachment();
  updateSmrAttachment();
});
</script>
