const SITE_COLUMNS = [
  "id",
  "ligand",
  "pdbId",
  "chain",
  "site",
  "pdbFile",
  "residueFile",
  "residueCount",
  "residueIndices",
];

function escapeCsvField(value) {
  const normalizedValue = Array.isArray(value) ? value.join(" ") : (value ?? "");
  const text = String(normalizedValue);

  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

function saveBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  saveBlobObject(filename, blob);
}

function saveBlobObject(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function asDownloadPath(path) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return path.startsWith("/") ? path : "/" + path;
}

export function filenameFromPath(path) {
  if (!path) {
    return "";
  }

  return String(path).split("/").pop() || "";
}

function withoutInternalPaths(site) {
  const exportSite = { ...site };

  exportSite.pdbFile = filenameFromPath(site.pdbPath);
  exportSite.residueFile = filenameFromPath(site.residuePath);

  delete exportSite.pdbPath;
  delete exportSite.residuePath;

  return exportSite;
}

export function downloadFile(path) {
  const link = document.createElement("a");
  const downloadPath = asDownloadPath(path);

  link.href = downloadPath;
  link.download = downloadPath.split("/").pop() || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function makeCrc32Table() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  });
}

const CRC32_TABLE = makeCrc32Table();

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(bytes, value) {
  bytes.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function dateToDosTime(date) {
  const year = Math.max(1980, date.getFullYear());

  return {
    date:
      ((year - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralDirectory = [];
  let offset = 0;
  const now = dateToDosTime(new Date());

  files.forEach((file) => {
    const filenameBytes = encoder.encode(file.name);
    const checksum = crc32(file.bytes);
    const localHeader = [];

    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, now.time);
    writeUint16(localHeader, now.date);
    writeUint32(localHeader, checksum);
    writeUint32(localHeader, file.bytes.length);
    writeUint32(localHeader, file.bytes.length);
    writeUint16(localHeader, filenameBytes.length);
    writeUint16(localHeader, 0);

    localParts.push(new Uint8Array(localHeader), filenameBytes, file.bytes);

    const centralHeader = [];
    writeUint32(centralHeader, 0x02014b50);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 20);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, now.time);
    writeUint16(centralHeader, now.date);
    writeUint32(centralHeader, checksum);
    writeUint32(centralHeader, file.bytes.length);
    writeUint32(centralHeader, file.bytes.length);
    writeUint16(centralHeader, filenameBytes.length);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint16(centralHeader, 0);
    writeUint32(centralHeader, 0);
    writeUint32(centralHeader, offset);

    centralDirectory.push(new Uint8Array(centralHeader), filenameBytes);
    offset += localHeader.length + filenameBytes.length + file.bytes.length;
  });

  const centralDirectorySize = centralDirectory.reduce(
    (total, part) => total + part.length,
    0,
  );
  const endRecord = [];

  writeUint32(endRecord, 0x06054b50);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, 0);
  writeUint16(endRecord, files.length);
  writeUint16(endRecord, files.length);
  writeUint32(endRecord, centralDirectorySize);
  writeUint32(endRecord, offset);
  writeUint16(endRecord, 0);

  return new Blob([...localParts, ...centralDirectory, new Uint8Array(endRecord)], {
    type: "application/zip",
  });
}

function encodeTarString(bytes, value, offset, length) {
  const encodedValue = new TextEncoder().encode(value);
  bytes.set(encodedValue.slice(0, length), offset);
}

function encodeTarOctal(bytes, value, offset, length) {
  const octalValue = value.toString(8).padStart(length - 1, "0") + "\0";
  encodeTarString(bytes, octalValue, offset, length);
}

function makeTarHeader(name, size) {
  const header = new Uint8Array(512);
  const normalizedName = name.replace(/^\/+/, "").slice(-100);

  encodeTarString(header, normalizedName, 0, 100);
  encodeTarOctal(header, 0o644, 100, 8);
  encodeTarOctal(header, 0, 108, 8);
  encodeTarOctal(header, 0, 116, 8);
  encodeTarOctal(header, size, 124, 12);
  encodeTarOctal(header, Math.floor(Date.now() / 1000), 136, 12);
  header.fill(32, 148, 156);
  header[156] = "0".charCodeAt(0);
  encodeTarString(header, "ustar", 257, 6);
  encodeTarString(header, "00", 263, 2);

  const checksum = header.reduce((total, byte) => total + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, "0") + "\0 ";
  encodeTarString(header, checksumText, 148, 8);

  return header;
}

async function writeTarFile(writable, path) {
  const response = await fetch(asDownloadPath(path));

  if (!response.ok) {
    throw new Error("Failed to download " + filenameFromPath(path));
  }

  const size = Number(response.headers.get("content-length"));
  if (!Number.isFinite(size)) {
    throw new Error("Missing file size for " + filenameFromPath(path));
  }

  await writable.write(makeTarHeader(path, size));

  if (response.body) {
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      await writable.write(value);
    }
  } else {
    await writable.write(new Uint8Array(await response.arrayBuffer()));
  }

  const padding = (512 - (size % 512)) % 512;
  if (padding) {
    await writable.write(new Uint8Array(padding));
  }
}

export async function downloadPdbZip(sites, filename) {
  const files = await Promise.all(
    sites.map(async (site) => {
      const response = await fetch(asDownloadPath(site.pdbPath));

      if (!response.ok) {
        throw new Error("Failed to download " + filenameFromPath(site.pdbPath));
      }

      return {
        name: filenameFromPath(site.pdbPath) || site.id + ".pdb",
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    }),
  );

  saveBlobObject(filename, makeZip(files));
}

export async function downloadPdbTar(paths, filename) {
  if (!window.showSaveFilePicker) {
    throw new Error(
      "Bulk PDB download needs a browser with streaming file downloads.",
    );
  }

  const fileHandle = await window.showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        description: "TAR archive",
        accept: { "application/x-tar": [".tar"] },
      },
    ],
  });
  const writable = await fileHandle.createWritable();

  try {
    for (const path of paths) {
      await writeTarFile(writable, path);
    }

    await writable.write(new Uint8Array(1024));
  } catch (error) {
    await writable.abort();
    throw error;
  }

  await writable.close();
}

export function sitesToCsv(sites) {
  const exportSites = sites.map((site) => withoutInternalPaths(site));

  return [
    SITE_COLUMNS.join(","),
    ...exportSites.map((site) =>
      SITE_COLUMNS.map((column) => escapeCsvField(site[column])).join(","),
    ),
  ].join("\n");
}

export function downloadSitesCsv(sites, filename) {
  saveBlob(filename, sitesToCsv(sites), "text/csv;charset=utf-8");
}

export function downloadSitesJson(sites, filename) {
  const content = JSON.stringify(
    sites.map((site) => withoutInternalPaths(site)),
    null,
    2,
  );
  saveBlob(filename, content, "application/json;charset=utf-8");
}
