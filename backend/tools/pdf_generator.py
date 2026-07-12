"""
pdf_generator.py — Utilities for creating PDFs from LinkedIn carousel slide images.

When LinkedIn document carousels can't be downloaded as a single PDF,
we have slide images (JPEG) — this module stitches them into a proper PDF.

Uses PyMuPDF (fitz) which is already a project dependency.
"""
import fitz  # PyMuPDF
import io
from typing import Optional


def images_to_pdf(image_bytes_list: list[bytes]) -> bytes:
    """
    Convert a list of JPEG/PNG image bytes into a single multi-page PDF.
    Each image becomes one page, sized to fit the image dimensions.

    Returns raw PDF bytes.
    """
    doc = fitz.open()  # New empty document

    for img_bytes in image_bytes_list:
        try:
            # Open image as a fitz Pixmap
            img_stream = io.BytesIO(img_bytes)
            # fitz.open can open image streams
            img_doc = fitz.open(stream=img_bytes, filetype="jpeg")
            # Convert image to PDF page
            img_pdf_bytes = img_doc.convert_to_pdf()
            img_doc.close()

            img_pdf = fitz.open("pdf", img_pdf_bytes)
            doc.insert_pdf(img_pdf)
            img_pdf.close()
        except Exception as e:
            print(f"⚠️ Skipping slide image (error): {e}")
            continue

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def images_to_pdf_reportlab(image_bytes_list: list[bytes], title: str = "LinkedIn Document") -> bytes:
    """
    Alternative: use Pillow + fpdf2 to stitch images into PDF.
    Fallback if PyMuPDF image conversion fails.
    """
    try:
        from PIL import Image
        from fpdf import FPDF
        import tempfile, os

        pdf = FPDF()
        pdf.set_auto_page_break(False)

        temp_files = []
        for i, img_bytes in enumerate(image_bytes_list):
            try:
                img = Image.open(io.BytesIO(img_bytes))
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")

                # Get dimensions in mm (assuming 96 DPI)
                w_px, h_px = img.size
                w_mm = w_px * 25.4 / 96
                h_mm = h_px * 25.4 / 96

                # Save to temp file
                tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                img.save(tmp.name, "JPEG", quality=90)
                temp_files.append(tmp.name)
                tmp.close()

                pdf.add_page(format=(w_mm, h_mm))
                pdf.image(tmp.name, x=0, y=0, w=w_mm, h=h_mm)
            except Exception as e:
                print(f"⚠️ Slide {i} failed: {e}")
                continue

        output = pdf.output()
        pdf_bytes = bytes(output)

        for f in temp_files:
            try:
                os.unlink(f)
            except Exception:
                pass

        return pdf_bytes
    except ImportError:
        # If neither PIL nor fpdf is available, fall back to PyMuPDF method
        return images_to_pdf(image_bytes_list)


def create_slides_pdf(image_bytes_list: list[bytes], title: str = "LinkedIn Document") -> Optional[bytes]:
    """
    Main entry point: convert slide images to PDF.
    Tries PyMuPDF first, falls back to reportlab/PIL.
    Returns None if no images were provided.
    """
    if not image_bytes_list:
        return None

    print(f"📄 Converting {len(image_bytes_list)} slide images to PDF...")

    try:
        pdf_bytes = images_to_pdf(image_bytes_list)
        if pdf_bytes and len(pdf_bytes) > 1000:  # Sanity check
            print(f"✅ PDF created: {len(pdf_bytes):,} bytes")
            return pdf_bytes
    except Exception as e:
        print(f"⚠️ PyMuPDF method failed: {e} — trying fallback")

    try:
        pdf_bytes = images_to_pdf_reportlab(image_bytes_list, title)
        if pdf_bytes and len(pdf_bytes) > 1000:
            print(f"✅ PDF created (fallback method): {len(pdf_bytes):,} bytes")
            return pdf_bytes
    except Exception as e:
        print(f"❌ PDF creation failed: {e}")

    return None
