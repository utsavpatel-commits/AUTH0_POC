"""HTML -> branded PDF rendering for Document Café.

Uses WeasyPrint (the production standard for HTML/CSS -> PDF). A Word document
uploaded to the Café is converted to HTML once (python-mammoth) and stored; every
download renders that HTML through this single function, so "download as PDF" is
deterministic and consistently branded regardless of the original source format.
"""
from __future__ import annotations

import os
import sys
from datetime import date
from html import escape


def _ensure_native_libs() -> None:
    """On macOS, WeasyPrint's native deps (pango/cairo/gobject) live in Homebrew's
    lib dir, which the dynamic loader doesn't search by default. Add it to the
    fallback path before WeasyPrint is imported. No-op on Linux/Docker (where the
    libs are installed system-wide)."""
    if sys.platform != "darwin":
        return
    cur = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    for path in ("/opt/homebrew/lib", "/usr/local/lib"):  # Apple Silicon, Intel
        if os.path.isdir(path) and path not in cur.split(":"):
            cur = f"{path}:{cur}" if cur else path
    if cur:
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = cur

# Branded page chrome: TCS rule, running footer with page numbers + a confidential
# watermark line. Kept print-first (pt units, @page) so output matches across renders.
_CSS = """
@page {
  size: Letter;
  margin: 26mm 18mm 22mm 18mm;
  @top-left  { content: "THE COMPLIANCE STORE"; font: 700 8pt 'Liberation Sans', sans-serif; color: #00a0d7; letter-spacing: .04em; }
  @top-right { content: "{HEADER_RIGHT}"; font: 8pt 'Liberation Sans', sans-serif; color: #94a3b8; }
  @bottom-left  { content: "{FOOTER_LEFT}"; font: 7.5pt 'Liberation Sans', sans-serif; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt 'Liberation Sans', sans-serif; color: #94a3b8; }
}
body { font-family: 'Liberation Serif', Georgia, serif; font-size: 11pt; color: #1e293b; line-height: 1.5; }
.doc-head { border-bottom: 2pt solid #00a0d7; padding-bottom: 8pt; margin-bottom: 16pt; }
.doc-title { font-family: 'Liberation Sans', sans-serif; font-size: 20pt; font-weight: 700; color: #0f1b2d; margin: 0 0 4pt; }
.doc-meta { font-family: 'Liberation Sans', sans-serif; font-size: 9pt; color: #64748b; }
.doc-meta .sep { color: #cbd5e1; padding: 0 5pt; }
h1 { font-family: 'Liberation Sans', sans-serif; font-size: 15pt; color: #0f1b2d; margin: 16pt 0 6pt; }
h2 { font-family: 'Liberation Sans', sans-serif; font-size: 13pt; color: #0f1b2d; margin: 14pt 0 5pt; }
h3 { font-family: 'Liberation Sans', sans-serif; font-size: 11.5pt; color: #1e293b; margin: 12pt 0 4pt; }
p { margin: 0 0 8pt; }
ul, ol { margin: 0 0 8pt 18pt; }
li { margin: 0 0 3pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 10pt; }
th, td { border: 0.5pt solid #cbd5e1; padding: 5pt 7pt; text-align: left; vertical-align: top; }
th { background: #eef4fb; font-family: 'Liberation Sans', sans-serif; font-weight: 700; color: #0f1b2d; }
blockquote { border-left: 2pt solid #00a0d7; margin: 8pt 0; padding: 2pt 0 2pt 12pt; color: #475569; }
a { color: #0284c7; text-decoration: none; }
img { max-width: 100%; }
"""


def render_document_pdf(
    *,
    title: str,
    html: str,
    facility_name: str | None = None,
    category: str | None = None,
    version: int | None = None,
    status: str | None = None,
) -> bytes:
    """Render a Café document's HTML body into a branded PDF and return the bytes."""
    _ensure_native_libs()
    import weasyprint  # imported lazily — pulls in pango/cairo at first use

    meta_bits = []
    if facility_name:
        meta_bits.append(escape(facility_name))
    if category:
        meta_bits.append(escape(category))
    if version is not None:
        meta_bits.append(f"Version {version}")
    if status:
        meta_bits.append(escape(status.replace("_", " ").title()))
    meta_bits.append(f"Generated {date.today().isoformat()}")
    meta = '<span class="sep">|</span>'.join(meta_bits)

    header_right = escape(title)[:60]
    footer_left = f"{escape(title)[:50]} — confidential"

    css = (_CSS
           .replace("{HEADER_RIGHT}", header_right.replace('"', "'"))
           .replace("{FOOTER_LEFT}", footer_left.replace('"', "'")))

    full = f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>
<body>
  <div class="doc-head">
    <div class="doc-title">{escape(title)}</div>
    <div class="doc-meta">{meta}</div>
  </div>
  {html or "<p><em>This document has no content yet.</em></p>"}
</body></html>"""

    return weasyprint.HTML(string=full).write_pdf()
