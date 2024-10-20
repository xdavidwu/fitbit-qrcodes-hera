import { me } from "appbit";
import { display } from "display";
import { readFileSync, renameSync, unlinkSync, writeFileSync, openSync, readSync, closeSync } from "fs";
import { inbox } from "file-transfer";
import document from "document";

const SETTINGS_FILE = "settings.cbor";
const SETTINGS_TYPE = "cbor";

const DisplayBrightnessValue = [undefined, "dim", "normal", "max"] as const;
let brightnessIndex = 0;

display.autoOff = false;
display.on = true;

let mySettings;
loadSettings();
me.onunload = saveSettings;

const cycleBrightness = () => {
  brightnessIndex = (brightnessIndex + 1) % DisplayBrightnessValue.length;
  display.brightnessOverride = DisplayBrightnessValue[brightnessIndex];
};

document.onkeypress = (e) => {
  switch (e.key) {
    case "down":
      cycleBrightness();
      break;
  }
};

inbox.addEventListener("newfile", () => {
  let filename;
  do {
    filename = inbox.nextFile();
    if (!filename) {
      continue;
    }
    console.log("Received file: " + filename);

    if (filename === "metadata") {
      const data = String.fromCharCode.apply(
        null,
        new Uint16Array(readFileSync("/private/data/" + filename))
      );
      mySettings.metadata = JSON.parse(data);
    } else {
      if (mySettings[filename]) {
        unlinkSync(mySettings[filename]);
      }
      const newFilename = `/private/data/${new Date().valueOf()}.txi`;
      renameSync(`/private/data/${filename}`, newFilename);
      mySettings[filename] = newFilename;
    }
    applySettings();
  } while (filename);
});

function loadSettings() {
  try {
    mySettings = readFileSync(SETTINGS_FILE, SETTINGS_TYPE);
    applySettings();
  } catch (ex) {
    mySettings = {};
  }
}

function saveSettings() {
  writeFileSync(SETTINGS_FILE, mySettings, SETTINGS_TYPE);
}

function applySettings() {
  let hasQrCode = false;

  const containerEl = document
    .getElementById("panorama")
    .getElementById("container");

  const metadata = mySettings.metadata || {};
  for (let i = 1; i <= 10; i++) {
    const enabled = metadata[i] && metadata[i].enabled === true;
    if (enabled) {
      hasQrCode = true;
    }

    const cardEl = containerEl.getElementById(`qr-code-${i}`) as GraphicsElement;
    if (!cardEl) {
      console.error("No card element found for " + i);
      continue;
    }

    cardEl.style.display = enabled ? "inline" : "none";

    const imgEl = cardEl.getElementById("qr-code-image") as ImageElement;
    if (imgEl) {
      const filename = mySettings[`file${i}`];
      imgEl.href = filename || "";
      if (filename) {
        const fd = openSync(filename, "r");
        const header = new Uint32Array(10);
        readSync(fd, header, 0, 40, 0);
        closeSync(fd);

        imgEl.width = header[6];
        imgEl.height = header[7];
        imgEl.x = Math.floor((282 - header[6]) / 2);
        imgEl.y = Math.floor((282 - header[7]) / 2);
      }
    }

    const textEl = cardEl.getElementById("qr-code-label");
    if (textEl) {
      textEl.text =
        metadata[i] && metadata[i].label
          ? metadata[i].label.substring(0, 50)
          : "";
    }
  }

  const messageEl = document.getElementById("message") as GraphicsElement;
  messageEl.style.display = hasQrCode ? "none" : "inline";
}
