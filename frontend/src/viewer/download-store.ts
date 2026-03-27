let _blob: Blob | null = null;
let _filename: string = 'model.ifc';

export function setDownloadInfo(blob: Blob, filename: string) {
  _blob = blob;
  _filename = filename.endsWith('.ifc') ? filename : filename + '.ifc';
}

export function triggerDownload() {
  if (!_blob) return;
  const url = URL.createObjectURL(_blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = _filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
