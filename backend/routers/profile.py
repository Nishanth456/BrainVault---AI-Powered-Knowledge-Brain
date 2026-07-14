"""
Phase 11 — Profile Router
GET  /api/profile          → fetch full profile (creates default if not exists)
PUT  /api/profile          → update full profile
PATCH /api/profile/{section} → update one section
POST /api/profile/resume   → upload resume to MinIO
GET  /api/profile/resume   → redirect to resume download URL
"""

import json
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from backend.models.database import get_db
from backend.models.schemas import UserProfile
from backend.services.minio import client as minio_client
from backend.config import settings

router = APIRouter(prefix="/api/profile", tags=["profile"])

# ── Nishanth's pre-seeded data ────────────────────────────────────────────────

DEFAULT_PROFILE = {
    "full_name": "Nishanth Gadey",
    "email": "nishanthgnvs04@gmail.com",
    "phone": "",
    "location": "Razole, Andhra Pradesh, India - 533242",
    "linkedin_url": "https://www.linkedin.com/in/nishanth-gadey-458141261",
    "github_url": "https://github.com/Nishanth456",
    "website_url": "",
    "summary": "AI and ML enthusiast with hands-on experience in Generative AI, Deep Learning, Machine Learning, and data-driven projects, aiming to innovate in the tech space. Experienced in working with AI models and exploring their real-world applications.",
    "education": [
        {
            "degree": "BTech in CSE - AI & ML",
            "institution": "VIT-AP University, Amaravathi, India",
            "duration": "July 2021 – May 2025",
            "score": "CGPA 9.00"
        }
    ],
    "experience": [
        {
            "role": "AI Intern",
            "company": "Tripsaverz",
            "duration": "July 2024 – Oct 2024",
            "responsibilities": [
                "Developed and implemented AI-driven features to enhance user experience and optimize travel booking processes.",
                "Idea development for AI-driven features in JSON automation and Trip Planner projects.",
                "Collaborated with the development team on code generation, testing, and debugging for product enhancements.",
                "Leveraged LLMs to maximize user savings and deliver personalized travel recommendations."
            ],
            "tech": ["Python", "LangChain", "Django"]
        }
    ],
    "skills": {
        "Programming & AI Tools": ["Python", "TensorFlow", "PyTorch", "Scikit-Learn", "LangChain", "LlamaIndex"],
        "ML & DL Expertise": ["Machine Learning", "Deep Learning", "NLP", "Transformers", "Generative AI", "LLMs"],
        "Data & Modeling": ["Data Preprocessing", "Transfer Learning", "Model Evaluation", "Boosting Classifiers", "GANs"]
    },
    "certifications": [
        {"name": "Developing Generative AI Applications", "issuer": "edX / IBM", "year": "2024", "credential_url": ""},
        {"name": "Neural Networks and Deep Learning", "issuer": "DeepLearning.AI / Coursera", "year": "2024", "credential_url": ""},
        {"name": "Introducing Generative AI with AWS", "issuer": "Udacity", "year": "2024", "credential_url": ""},
        {"name": "Data Mining", "issuer": "NPTEL", "year": "2024", "badge": "Gold — Top 5%", "credential_url": ""},
        {"name": "The Joy of Computing using Python", "issuer": "NPTEL", "year": "2023", "badge": "Gold — Top 2%", "credential_url": ""}
    ],
    "projects": [
        {
            "title": "Alzheimer MRI Scan Brain Disease Classification",
            "year": "2024",
            "description": "Developed a classification model using proposed SEResNet-Mix architecture, achieving 99.02% F1-score on balancing imbalanced Alzheimer MRI dataset, enhancing early detection of brain disease.",
            "tech": ["Python", "PyTorch", "ResNet-18"]
        },
        {
            "title": "Blog-Post-Generator-Llama2",
            "year": "2024",
            "description": "Built a blog post generator that allows users to input a topic, specify length, and target audience, automatically generating content using LangChain and Llama2 through a Streamlit interface.",
            "tech": ["Python", "LangChain", "Llama2", "Streamlit"]
        },
        {
            "title": "LLM Study App",
            "year": "2023",
            "description": "Developed a learning tool using the Llama2-70B-Chat Model with RAG approach for PDF-based question answering, YouTube video summarization, and generating quizzes with MCQs.",
            "tech": ["Python", "LangChain", "Llama2", "RAG"]
        },
        {
            "title": "IoT Attack Classification using Hybrid Deep Learning",
            "year": "2023",
            "description": "Engineered a Hybrid Deep Learning model to classify attacks using the CIC 2023 IoT dataset, achieving 98.45% accuracy.",
            "tech": ["Python", "TensorFlow", "Deep Learning"]
        },
        {
            "title": "Credit Card Offer Acceptance Prediction",
            "year": "2023",
            "description": "Implemented and optimized machine learning algorithms to predict credit card offer acceptance, achieving 95.14% accuracy.",
            "tech": ["Python", "Scikit-Learn", "Boosting", "Bagging"]
        }
    ],
    "publications": [
        {
            "type": "Conference Paper",
            "title": "An Artificial Intelligence based Attendance Monitoring System for Malpractice Control",
            "venue": "MAI 2023 @ NIT Patna",
            "year": "2023"
        },
        {
            "type": "Book Chapter",
            "title": "Enhancing 5G and IoT network security: A multi-model DL approach for attack classification",
            "venue": "",
            "year": ""
        },
        {
            "type": "Patent",
            "title": "A System and a Method for Detection and Prevention of Attacks in IOT Networks",
            "venue": "",
            "year": ""
        }
    ],
    "achievements": [
        "Advanced to Round 2 of ML Hackathon 2K23 at Vishnu Institute of Technology, Bhimavaram",
        "Earned a coveted spot in the Amazon ML Summer School 2024"
    ],
    "resume_path": None
}


async def get_or_create_profile(db: AsyncSession) -> UserProfile:
    result = await db.execute(select(UserProfile).where(UserProfile.id == 1))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(id=1, **DEFAULT_PROFILE)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


def profile_to_dict(p: UserProfile) -> dict:
    return {
        "id": p.id,
        "full_name": p.full_name,
        "email": p.email,
        "phone": p.phone,
        "location": p.location,
        "linkedin_url": p.linkedin_url,
        "github_url": p.github_url,
        "website_url": p.website_url,
        "summary": p.summary,
        "education": p.education or [],
        "experience": p.experience or [],
        "skills": p.skills or {},
        "certifications": p.certifications or [],
        "projects": p.projects or [],
        "publications": p.publications or [],
        "achievements": p.achievements or [],
        "resume_path": p.resume_path,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


# ── GET full profile ──────────────────────────────────────────────────────────

@router.get("")
async def get_profile(db: AsyncSession = Depends(get_db)):
    profile = await get_or_create_profile(db)
    return profile_to_dict(profile)


# ── PUT full profile update ───────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    website_url: str | None = None
    summary: str | None = None
    education: list | None = None
    experience: list | None = None
    skills: dict | None = None
    certifications: list | None = None
    projects: list | None = None
    publications: list | None = None
    achievements: list | None = None


@router.put("")
async def update_profile(body: ProfileUpdate, db: AsyncSession = Depends(get_db)):
    profile = await get_or_create_profile(db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile_to_dict(profile)


# ── PATCH single section ──────────────────────────────────────────────────────

class SectionUpdate(BaseModel):
    value: Any


PATCHABLE_SECTIONS = {
    "personal", "summary", "education", "experience",
    "skills", "certifications", "projects", "publications", "achievements"
}


@router.patch("/{section}")
async def update_section(section: str, body: SectionUpdate, db: AsyncSession = Depends(get_db)):
    if section not in PATCHABLE_SECTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown section: {section}")
    profile = await get_or_create_profile(db)
    if section == "personal":
        personal = body.value  # dict with personal fields
        for key in ["full_name", "email", "phone", "location", "linkedin_url", "github_url", "website_url"]:
            if key in personal:
                setattr(profile, key, personal[key])
    else:
        setattr(profile, section, body.value)
    await db.commit()
    await db.refresh(profile)
    return profile_to_dict(profile)


# ── POST resume upload ────────────────────────────────────────────────────────

@router.post("/resume")
async def upload_resume(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename.endswith((".pdf", ".docx")):
        raise HTTPException(status_code=400, detail="Only PDF or DOCX files are accepted")

    bucket = settings.MINIO_BUCKET_NAME
    object_name = f"profile/resume/{file.filename}"
    data = await file.read()

    try:
        import io
        minio_client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=io.BytesIO(data),
            length=len(data),
            content_type=file.content_type or "application/octet-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    profile = await get_or_create_profile(db)
    profile.resume_path = object_name
    await db.commit()

    return {"resume_path": object_name, "filename": file.filename}


# ── GET resume download ───────────────────────────────────────────────────────

@router.get("/resume")
async def download_resume(db: AsyncSession = Depends(get_db)):
    profile = await get_or_create_profile(db)
    if not profile.resume_path:
        raise HTTPException(status_code=404, detail="No resume uploaded yet")

    bucket = settings.MINIO_BUCKET_NAME
    try:
        response = minio_client.get_object(bucket, profile.resume_path)
        filename = profile.resume_path.split("/")[-1]
        return StreamingResponse(
            response,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Resume not found: {e}")
