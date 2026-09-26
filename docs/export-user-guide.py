"""Build the user guide DOCX and PDF from its Markdown source."""

from __future__ import annotations

import re
from pathlib import Path

import pypandoc
from playwright.sync_api import sync_playwright


DOCS = Path(__file__).resolve().parent
SOURCE = DOCS / "руководство-пользователя.md"
STEM = SOURCE.with_suffix("")


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    # Pandoc image size is set only in the export input; GitHub keeps ordinary Markdown images.
    docx_source = re.sub(
        r"(!\[[^\]]*\]\(assets/screenshots/[^)]+\))",
        r"\1{width=15cm}",
        source,
    )
    pypandoc.convert_text(
        docx_source,
        "docx",
        format="markdown+raw_html",
        outputfile=str(STEM.with_suffix(".docx")),
        extra_args=[f"--resource-path={DOCS}", "--metadata=lang:ru-RU"],
    )

    html = pypandoc.convert_text(
        source,
        "html5",
        format="markdown+raw_html",
        extra_args=[
            "--standalone",
            "--embed-resources",
            f"--resource-path={DOCS}",
            "--metadata=lang:ru-RU",
        ],
    )
    css = """
    <style>
      @page { size: A4; margin: 15mm 17mm; }
      body { font-family: Arial, sans-serif; color: #17212b; font-size: 10.5pt; line-height: 1.43; }
      h1 { font-size: 23pt; color: #153653; }
      h2 { font-size: 17pt; color: #153653; margin-top: 24pt; }
      h3 { font-size: 13pt; color: #153653; margin-top: 18pt; }
      h1, h2, h3 { break-after: avoid; }
      p, li { orphans: 2; widows: 2; }
      img { display: block; width: 100%; max-width: 175mm; height: auto; max-height: 116mm; object-fit: contain; margin: 8pt auto 3pt; break-inside: avoid; }
      p:has(img) { break-inside: avoid; margin-bottom: 0; }
      p:has(> em) { font-size: 9pt; color: #435466; margin-top: 3pt; break-before: avoid; }
      a { color: #12619b; text-decoration: underline; }
      ul { padding-left: 22pt; }
    </style>
    """
    html = html.replace("</head>", css + "</head>", 1)

    with sync_playwright() as playwright:
        chrome_candidates = [
            Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        ]
        chrome = next((path for path in chrome_candidates if path.is_file()), None)
        browser = playwright.chromium.launch(
            executable_path=str(chrome) if chrome else None,
            headless=True,
        )
        page = browser.new_page()
        page.set_content(html, wait_until="load")
        page.pdf(
            path=str(STEM.with_suffix(".pdf")),
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
        )
        browser.close()

    for output in (STEM.with_suffix(".docx"), STEM.with_suffix(".pdf")):
        print(f"{output.name}: {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
