import {
  EEPROM_BLOCK_SIZE,
  FLASH_BLOCK_SIZE,
  sendPacket,
  readPacket,
  eepromRead,
  eepromWrite,
  eepromReboot,
  unpackFirmware,
  unpackFirmwareVersion,
  flashGenerateCommand,
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

const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const baudSelect = document.getElementById("baudSelect");
const connectionLabel = document.getElementById("connectionLabel");
const deviceInfo = document.getElementById("deviceInfo");
const firmwareInfo = document.getElementById("firmwareInfo");
const statusDot = document.getElementById("homeStatusDot");
const errorEl = document.getElementById("homeError");
const errorTextEl = errorEl ? errorEl.querySelector(".status-error-text") : null;
const errorCloseBtn = errorEl ? errorEl.querySelector(".status-error-close") : null;
const backupBtn = document.getElementById("backupBtn");
const backupCalib = document.getElementById("backupCalib");
const restoreBtn = document.getElementById("restoreBtn");
const restoreCalib = document.getElementById("restoreCalib");
const restoreFile = document.getElementById("restoreFile");
const firmwareSourceLocal = document.getElementById("firmwareSourceLocal");
const firmwareSourceGithub = document.getElementById("firmwareSourceGithub");
const firmwareLocalRow = document.getElementById("firmwareLocalRow");
const firmwareFile = document.getElementById("firmwareFile");
const flashBtn = document.getElementById("flashBtn");
const logOutput = document.getElementById("logOutput");
const clearLogBtn = document.getElementById("clearLogBtn");
const backupFill = document.getElementById("backupFill");
const backupPct = document.getElementById("backupPct");
const restoreFill = document.getElementById("restoreFill");
const restorePct = document.getElementById("restorePct");
const flashFill = document.getElementById("flashFill");
const flashPct = document.getElementById("flashPct");
const footerCopyright = document.getElementById("footerCopyright");

const EEPROM_CONFIG_END = 0x1e00;
const EEPROM_CAL_END = 0x2000;
const FIRMWARE_GITHUB_URL =
  "https://cdn.jsdelivr.net/gh/joaquimorg/UV-KX-firmware@main/firmware/uv-kx_V1.0.packed.bin";
const OFFICIAL_VERSION_PACKET = new Uint8Array([
  48, 5, 16, 0, 42, 79, 69, 70, 87, 45, 76, 79, 83, 69, 72, 85, 0, 0, 0, 0,
]);

const log = (message, tone = "info") => {
  const entry = document.createElement("div");
  const timestamp = new Date().toLocaleTimeString("en-US");
  entry.textContent = `[${timestamp}] ${message}`;
  entry.dataset.tone = tone;
  logOutput.appendChild(entry);
  logOutput.scrollTop = logOutput.scrollHeight;
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
  connectionLabel.textContent = connected ? "Connected" : "Disconnected";
  statusDot.dataset.status = connected ? "connected" : "disconnected";
  connectBtn.disabled = connected;
  disconnectBtn.disabled = !connected;
  backupBtn.disabled = !connected;
  restoreBtn.disabled = !connected;
  baudSelect.disabled = connected;
};

const updateDeviceInfo = async (port) => {
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

const getConnectedPort = async (baudRate) => {
  await connectSerial({ baudRate });
  const port = getPort();
  if (!port) throw new Error("No serial port available.");
  return port;
};

const downloadBlob = (data, filename) => {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const setProgress = (fillEl, labelEl, value, visible = true) => {
  const pct = Math.max(0, Math.min(100, value));
  const container = fillEl ? fillEl.closest(".progress") : null;
  if (container) {
    container.classList.toggle("active", visible);
  }
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (labelEl) labelEl.textContent = `${pct.toFixed(1)}%`;
};

const resetProgress = () => {
  setProgress(backupFill, backupPct, 0, false);
  setProgress(restoreFill, restorePct, 0, false);
  setProgress(flashFill, flashPct, 0, false);
};

const hideProgressLater = (fillEl, labelEl) => {
  setTimeout(() => setProgress(fillEl, labelEl, 0, false), 800);
};

const setFirmwareSourceUI = () => {
  const useGithub = firmwareSourceGithub && firmwareSourceGithub.checked;
  if (firmwareFile) {
    firmwareFile.disabled = useGithub;
    if (useGithub) {
      firmwareFile.value = "";
    }
  }
  if (firmwareLocalRow) firmwareLocalRow.classList.toggle("is-disabled", useGithub);
};

const backupRange = async (start, end, fileName) => {
  await getConnectedPort(Number(baudSelect.value));
  const rawEEPROM = new Uint8Array(end - start);
  setProgress(backupFill, backupPct, 0, true);
  for (let i = start; i < end; i += EEPROM_BLOCK_SIZE) {
    const data = await eepromRead(getPort(), i, EEPROM_BLOCK_SIZE);
    rawEEPROM.set(data, i - start);
    const pct = ((i - start) / rawEEPROM.length) * 100;
    setProgress(backupFill, backupPct, pct, true);
  }
  setProgress(backupFill, backupPct, 100);
  hideProgressLater(backupFill, backupPct);
  downloadBlob(new Blob([rawEEPROM], { type: "application/octet-stream" }), fileName);
};

const restoreRange = async (start, input) => {
  await getConnectedPort(Number(baudSelect.value));
  const rawEEPROM = new Uint8Array(await input.arrayBuffer());
  setProgress(restoreFill, restorePct, 0, true);
  for (let i = start; i < rawEEPROM.length + start; i += EEPROM_BLOCK_SIZE) {
    const chunk = rawEEPROM.slice(i - start, i - start + EEPROM_BLOCK_SIZE);
    await eepromWrite(getPort(), i, chunk, chunk.length);
    const pct = ((i - start) / rawEEPROM.length) * 100;
    setProgress(restoreFill, restorePct, pct, true);
  }
  setProgress(restoreFill, restorePct, 100);
  hideProgressLater(restoreFill, restorePct);
  await eepromReboot(getPort());
};

const connect = async () => {
  if (!claim("home")) {
    const message = "Another tool is using the serial connection.";
    setError(message);
    log(message, "error");
    return;
  }
  setError("");
  try {
    await connectSerial({ baudRate: Number(baudSelect.value) });
    await updateDeviceInfo(getPort());
    setError("");
    log(`Connected at ${baudSelect.value} bps.`);
  } catch (error) {
    const message = `Failed to connect: ${error.message}`;
    setError(message);
    log(message, "error");
    setConnected(false);
  } finally {
    release("home");
  }
};

const disconnect = async () => {
  if (!claim("home")) {
    const message = "Another tool is using the serial connection.";
    setError(message);
    log(message, "error");
    return;
  }
  setError("");
  try {
    await disconnectSerial({ keepPort: true });
    setConnected(false);
    updateDeviceInfo(null);
    setError("");
    log("Serial port disconnected.");
  } catch (error) {
    const message = `Failed to disconnect: ${error.message}`;
    setError(message);
    log(message, "error");
  } finally {
    release("home");
  }
};

const backupEeprom = async () => {
  if (!claim("home")) {
    log("Another tool is using the serial connection.", "error");
    return;
  }
  const includeCal = backupCalib.checked;
  const end = includeCal ? EEPROM_CAL_END : EEPROM_CONFIG_END;
  const fileName = includeCal ? "uv-k5-eeprom-with-cal.bin" : "uv-k5-eeprom-no-cal.bin";
  log(`Starting EEPROM backup (${includeCal ? "with" : "without"} calibration).`);
  try {
    await backupRange(0, end, fileName);
    log("Backup completed.", "success");
  } catch (error) {
    log(`Backup failed: ${error.message}`, "error");
    setProgress(backupFill, backupPct, 0, false);
  } finally {
    release("home");
  }
};

const restoreEeprom = async () => {
  if (!claim("home")) {
    log("Another tool is using the serial connection.", "error");
    return;
  }
  if (!restoreFile.files.length) {
    log("Select a .bin file to restore.", "error");
    release("home");
    return;
  }
  const includeCal = restoreCalib.checked;
  const file = restoreFile.files[0];
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
    setProgress(restoreFill, restorePct, 0, false);
  } finally {
    release("home");
  }
};

const flashFirmware = async () => {
  if (!claim("home")) {
    log("Another tool is using the serial connection.", "error");
    return;
  }
  const useGithub = firmwareSourceGithub && firmwareSourceGithub.checked;
  if (!useGithub && (!firmwareFile || !firmwareFile.files.length)) {
    log("Select a firmware file or choose the GitHub option.", "error");
    release("home");
    return;
  }

  const previousBaud = baudSelect ? Number(baudSelect.value) : getPreferredBaud() || 115200;
  try {
    baudSelect.value = "38400";
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

    setProgress(flashFill, flashPct, 0, true);
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
    if (useGithub) {
      log("Downloading firmware from GitHub...");
      const response = await fetch(FIRMWARE_GITHUB_URL);
      if (!response.ok) {
        throw new Error(`Failed to download firmware (${response.status}).`);
      }
      firmwareEncoded = new Uint8Array(await response.arrayBuffer());
    } else {
      const file = firmwareFile.files[0];
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
      setProgress(flashFill, flashPct, pct, true);
    }

    setProgress(flashFill, flashPct, 100);
    hideProgressLater(flashFill, flashPct);
    log("Firmware programmed successfully.", "success");
  } catch (error) {
    log(`Firmware programming failed: ${error.message}`, "error");
    setProgress(flashFill, flashPct, 0, false);
  } finally {
    await disconnectSerial({ keepPort: true });
    if (baudSelect) {
      baudSelect.value = String(previousBaud);
      setPreferredBaud(previousBaud);
    }
    release("home");
  }
};

connectBtn.addEventListener("click", connect);
disconnectBtn.addEventListener("click", disconnect);
backupBtn.addEventListener("click", backupEeprom);
restoreBtn.addEventListener("click", restoreEeprom);
flashBtn.addEventListener("click", flashFirmware);
clearLogBtn.addEventListener("click", () => {
  logOutput.innerHTML = "";
});

if (firmwareSourceLocal) {
  firmwareSourceLocal.addEventListener("change", setFirmwareSourceUI);
}
if (firmwareSourceGithub) {
  firmwareSourceGithub.addEventListener("change", setFirmwareSourceUI);
}

if (baudSelect) {
  const storedBaud = getPreferredBaud();
  if (storedBaud) baudSelect.value = String(storedBaud);
  baudSelect.addEventListener("change", () => {
    setPreferredBaud(Number(baudSelect.value));
  });
}

subscribe((state) => {
  setConnected(state.connected);
  if (state.connected) {
    setError("");
  }
  updateDeviceInfo(state.port);
  if (firmwareInfo) {
    firmwareInfo.textContent = state.firmwareVersion || "--";
  }
  if (baudSelect && state.baudRate) {
    baudSelect.value = String(state.baudRate);
    setPreferredBaud(state.baudRate);
  }
});
resetProgress();
setFirmwareSourceUI();
log("Ready. Connect the radio to begin.");

if (footerCopyright) {
  const year = new Date().getFullYear();
  footerCopyright.textContent = `Copyright ${year} joaquim.org`;
}
