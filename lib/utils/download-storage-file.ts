export async function downloadStorageFile(storagePath: string): Promise<void> {
  const response = await fetch(`/api/files/${storagePath}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const blobUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = storagePath.split("/").pop() || "image";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}
