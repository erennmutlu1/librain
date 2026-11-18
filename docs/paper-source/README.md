# Companion paper source

`architecture.html` is the source of `docs/architecture.pdf`. The original Writer file was lost, so this
HTML was rebuilt from the June 2026 PDF (commit `4322a6d`, 65 pages). It prints with the same page size
(US Letter), fonts (Carlito, from Google Fonts), margins, running header and footers as that PDF.

## Rebuild the PDF

Requirements: Google Chrome, Python 3.9+ with `pypdf`, and poppler's `pdftotext` (only used as a fallback).

```bash
python3 -m venv /tmp/paper-venv && /tmp/paper-venv/bin/pip install pypdf
/tmp/paper-venv/bin/python docs/paper-source/build_paper.py
```

The script:

1. collects every `<h1>` and `<h2>` inside `<main>` (except those with `class="notoc"`) and writes the
   table of contents between the `TOC:BEGIN` / `TOC:END` markers in `architecture.html`;
2. prints the HTML with headless Chrome (`--headless=new --no-pdf-header-footer --virtual-time-budget=20000`,
   in a throwaway profile; the Chrome process is closed afterwards);
3. reads the page of each heading back from the PDF, writes the numbers into the TOC and prints again,
   until the numbers stop changing (normally two passes);
4. sets the PDF metadata (Title, Author, Subject) and writes `docs/architecture.pdf`.

Options: `--out PATH` writes elsewhere (useful for a trial build), `--keep-toc` skips the page passes,
`--chrome PATH` points at a different Chrome binary. Fonts load from Google Fonts, so the build needs
network access to `fonts.googleapis.com` / `fonts.gstatic.com`.

## Editing

- **Text**: edit the paragraphs directly. Bold run-in labels are `<p><b>Goal.</b> …</p>`; code spans are
  `<code>…</code>`.
- **Headings**: `<h1>` = numbered section, `<h2>` = subsection (both go in the TOC), `<h3>` and `<h4>` =
  lower levels (not in the TOC). Every `<h1>`/`<h2>` needs a unique `id`; add `class="notoc"` to keep a
  subsection heading out of the TOC (the Appendix A demonstrations and A.1 use it). Do not edit the TOC
  block by hand; the build rewrites it.
- **Tables**: `<figure class="table">` holding a `<table>` (column widths in a `<colgroup>`, header row in
  `<thead>`, which Chrome repeats when a table breaks across pages) and a `<p class="caption">`. Table and
  figure numbers are plain text; renumber by hand if you insert one.
- **Figures**: `<figure class="fig">` with an `<img>` from `images/` (sized in pt to match the original
  layout) and a `<figcaption class="caption">`.
- **Lists**: `<ul>` / `<ol>`; they are ragged-right like the original, except `<ul class="justified">`.
- **Layout**: page geometry, header and footer are the `@page` rules at the top of the `<style>` block.
  The colours, the page size (`size: 612pt 792pt`; use `size: A4` for A4) and the running header text are
  set there as well. Body text uses a small negative `word-spacing` so that justified lines break where
  Writer broke them; keep it if you want the page flow to stay close to the original.

## Files

- `architecture.html`: the source.
- `images/`: the twelve figures extracted from the original PDF (image plus soft mask combined into PNG).
- `build_paper.py`: the build described above.
- `CHANGES.md`: the passages changed or added since the June 2026 PDF, with a word-level diff summary.
