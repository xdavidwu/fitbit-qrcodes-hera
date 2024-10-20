import { outbox } from "file-transfer";
import { settingsStorage } from "settings";
import { Byte, Charset, Encoder, type EncoderOptions } from "@nuintun/qrcode";
import { encode, TXIOutputFormat } from "@fitbit/image-codec-txi";
import { Image } from "image";
import { qrdecode } from "./qrdecode";

const QR_CODE_MIN_SIZE = 200; // size used on device
const MAX_QR_CODE_COUNT = 10;
const QR_CODES_ITERATOR = Array.from(
  { length: MAX_QR_CODE_COUNT },
  (_, i) => i + 1
);

class QrCodesCompanion {
  settings: any; // TODO

  constructor() {
    settingsStorage.addEventListener(
      "change",
      this.onSettingsChange.bind(this)
    );
    this.readSettings();
  }

  init() {
    QR_CODES_ITERATOR.forEach((i) =>
      this.updateQrCodeAsync(
        i,
        this.settings[`enabled${i}`],
        this.settings[`content${i}`],
        this.settings[`errorCorrectionLevel${i}`]
      )
    );
    this.updateMetaDataAsync();
  }

  async updateMetaDataAsync() {
    const metaData = Object.fromEntries(
      QR_CODES_ITERATOR.map((i) => [
        i,
        {
          enabled: this.settings[`enabled${i}`] === true,
          label: this.settings[`label${i}`],
        },
      ])
    );

    const str = JSON.stringify(metaData);
    const buffer = new ArrayBuffer(str.length * 2);
    const bufferView = new Uint16Array(buffer);
    for (let i = 0, length = str.length; i < length; i++) {
      bufferView[i] = str.charCodeAt(i);
    }

    await this.sendFileAsync("metadata", buffer);
  }

  async updateQrCodeAsync(i, enabled, data, errorCorrectionLevel: EncoderOptions['level'] = "L") {
    if (!data || !enabled) return;

    const encoder = new Encoder({ level: errorCorrectionLevel });
    // XXX: api design mistake?
    // ascii/8859-1 means "treat input as string of codepoints, use it as-is"
    // but utf-8 actually passes to TextEncoder, which means "treat as js string (of utf-16 codepoints), encode to utf-8"
    const encoded = encoder.encode(new Byte(data, Charset.UTF_8));
    const { size } = encoded;

    // scale up to avoid blurry txi images
    const scalingFactor = Math.ceil(QR_CODE_MIN_SIZE / size);

    const bitmapSize = size * scalingFactor;
    const bitmap = [];
    for (let x = 0; x < size; x++) {
      for (let i = 0; i < scalingFactor; i++) {
        for (let y = 0; y < size; y++) {
          const isDark = encoded.get(x, y);
          for (let j = 0; j < scalingFactor; j++) {
            bitmap.push(isDark ? 255 : 0, 0, 0, 0);
          }
        }
      }
    }

    const bitmapData = Uint8ClampedArray.from(bitmap);

    const txiArrayBuffer = encode(
      {
        width: bitmapSize,
        height: bitmapSize,
        data: bitmapData,
      },
      {
        outputFormat: TXIOutputFormat.A8, // grayscale
        rle: true,
      }
    );

    await this.sendFileAsync(`file${i}`, txiArrayBuffer);
  }

  async sendFileAsync(filename, buffer) {
    const fileTransfer = await outbox.enqueue(filename, buffer);
    console.log(`Enqueued ${fileTransfer.name}`);
  }

  onSettingsChange(evt) {
    if (evt.oldValue === evt.newValue) return;
    console.info("Settings have been changed!");
    this.applySettingsItem(evt.key, evt.newValue);

    QR_CODES_ITERATOR.forEach(async (i) => {
      const hasChanged = ["enabled", "content", "image", "errorCorrectionLevel"]
        .map((key) => `${key}${i}`)
        .some((key) => key === evt.key);
      console.log("hasChanged " + i + (hasChanged ? "yes" : "no"));
      if (!hasChanged) return;

      console.log("Settings of QR code " + i + " have been changed.");

      if (evt.key === `image${i}` && evt.newValue) {
        const imageData = JSON.parse(evt.newValue);
        const res = await qrdecode(imageData.imageUri).catch((e) => 'Parse image failed');
        settingsStorage.setItem(`image${i}`, "");
        settingsStorage.setItem(`content${i}`, res);
        this.settings[`content${i}`] = res;
      }

      this.updateQrCodeAsync(
        i,
        this.settings[`enabled${i}`],
        this.settings[`content${i}`],
        this.settings[`errorCorrectionLevel${i}`]
      );
    });

    this.updateMetaDataAsync();
  }

  readSettings() {
    this.settings = {};

    for (let i = 0; i < settingsStorage.length; i++) {
      const key = settingsStorage.key(i);
      const rawSettingValue = settingsStorage.getItem(key);
      this.applySettingsItem(key, rawSettingValue);
    }
  }

  applySettingsItem(key, rawSettingValue) {
    if (rawSettingValue === "true") {
      // toggle input
      this.settings[key] = true;
      return;
    }

    try {
      const json = JSON.parse(rawSettingValue);
      if (!json) this.settings[key] = undefined;
      this.settings[key] = json.name
        ? json.name // text input
        : json.values
        ? json.values[0].value // select input
        : undefined;
    } catch (e) {
      this.settings[key] = undefined;
    }
  }
}

const app = new QrCodesCompanion();
app.init();
