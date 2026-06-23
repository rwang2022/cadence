// seconds -> "m:ss" (or "h:mm:ss")
export function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? `${h}:` : '') + `${mm}:${String(sec).padStart(2, '0')}`;
}

// bytes -> "4.7 MB" / "512 KB" (— when unknown)
export function fmtBytes(b) {
  if (b == null || b <= 0) return '—';
  const mb = b / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}
