// Standard browser downloads, including installed PWAs. No host-specific bridges.
export async function saveFile(data, filename) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.rel = 'noopener';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    return 'saved';
  } finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
}
