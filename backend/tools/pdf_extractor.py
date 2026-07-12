"""
pdf_extractor.py — PyMuPDF-based PDF text extraction.
Extracts text layer, metadata, and page count from raw PDF bytes.
"""
import fitz  # PyMuPDF
import tempfile
import os


class PDFExtractor:
    """Extract text and metadata from PDF files using PyMuPDF (free, open-source)."""

    def extract_from_bytes(self, pdf_bytes: bytes) -> dict:
        """
        Given raw PDF bytes, return:
        - full_text: all text concatenated
        - pages: list of {page_num, text} dicts
        - page_count: total pages
        - metadata: PDF document metadata
        """
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            doc = fitz.open(tmp_path)
            pages = []
            all_text_parts = []

            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text("text")  # Extract text layer
                pages.append({
                    "page_num": page_num + 1,
                    "text": text.strip()
                })
                if text.strip():
                    all_text_parts.append(f"[Page {page_num + 1}]\n{text.strip()}")

            metadata = doc.metadata or {}
            doc.close()

            return {
                "full_text": "\n\n".join(all_text_parts),
                "pages": pages,
                "page_count": len(pages),
                "metadata": {
                    "title": metadata.get("title", ""),
                    "author": metadata.get("author", ""),
                    "subject": metadata.get("subject", ""),
                }
            }
        finally:
            os.unlink(tmp_path)  # Always clean up temp file

    def extract_from_path(self, file_path: str) -> dict:
        """Extract from a local file path."""
        with open(file_path, "rb") as f:
            return self.extract_from_bytes(f.read())


pdf_extractor = PDFExtractor()
