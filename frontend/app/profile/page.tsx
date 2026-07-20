"use client"

import { useState, useEffect, useRef } from "react"
import {
  User, Mail, Phone, MapPin, Link2, GitBranch, Globe,
  Edit3, Check, X, Plus, Trash2, Upload, Download,
  GraduationCap, Briefcase, Code2, Award, FolderGit2,
  BookOpen, Trophy, FileText,
  ExternalLink
} from "lucide-react"
import { toast } from "sonner"

const API = "http://127.0.0.1:8000/api/profile"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Education {
  degree: string; institution: string; duration: string; score: string;
}
interface Experience {
  role: string; company: string; duration: string;
  responsibilities: string[]; tech: string[];
}
interface Project {
  title: string; year: string; description: string; tech: string[];
}
interface Publication {
  type: string; title: string; venue: string; year: string;
}
interface Certification {
  name: string; issuer: string; year: string; badge?: string; credential_url?: string;
}
interface Profile {
  full_name: string; email: string; phone: string; location: string;
  linkedin_url: string; github_url: string; website_url: string; summary: string;
  education: Education[]; experience: Experience[];
  skills: Record<string, string[]>;
  certifications: Certification[];
  projects: Project[]; publications: Publication[];
  achievements: string[]; resume_path: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sectionIcon: Record<string, React.ReactNode> = {
  education: <GraduationCap size={16} />,
  experience: <Briefcase size={16} />,
  skills: <Code2 size={16} />,
  certifications: <Award size={16} />,
  projects: <FolderGit2 size={16} />,
  publications: <BookOpen size={16} />,
  achievements: <Trophy size={16} />,
}

function SectionHeader({
  title, icon, editing, onEdit, onSave, onCancel
}: {
  title: string; icon: React.ReactNode;
  editing: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider">
        <span className="text-violet-400">{icon}</span>
        {title}
      </div>
      <div className="flex gap-2">
        {editing ? (
          <>
            <button onClick={onSave} className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors">
              <Check size={12} /> Save
            </button>
            <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs font-medium transition-colors">
              <X size={12} /> Cancel
            </button>
          </>
        ) : (
          <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-medium transition-colors border border-white/10">
            <Edit3 size={12} /> Edit
          </button>
        )}
      </div>
    </div>
  )
}

function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 text-violet-300 rounded-full text-xs font-medium">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="hover:text-red-400 transition-colors ml-0.5">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editSection, setEditSection] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Profile> | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(API).then(r => r.json()).then(data => { setProfile(data); setLoading(false) })
  }, [])

  const startEdit = (section: string) => {
    if (!profile) return
    const sectionData: Record<string, unknown> = {
      personal: {
        full_name: profile.full_name, email: profile.email,
        phone: profile.phone, location: profile.location,
        linkedin_url: profile.linkedin_url, github_url: profile.github_url,
        website_url: profile.website_url
      },
      summary: profile.summary,
      education: JSON.parse(JSON.stringify(profile.education)),
      experience: JSON.parse(JSON.stringify(profile.experience)),
      skills: JSON.parse(JSON.stringify(profile.skills)),
      certifications: JSON.parse(JSON.stringify(profile.certifications)),
      projects: JSON.parse(JSON.stringify(profile.projects)),
      publications: JSON.parse(JSON.stringify(profile.publications)),
      achievements: [...profile.achievements],
    }
    setDraft(sectionData[section])
    setEditSection(section)
  }

  const cancelEdit = () => { setEditSection(null); setDraft(null) }

  const saveSection = async (section: string) => {
    try {
      const res = await fetch(`${API}/${section}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: draft })
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      setProfile(updated)
      setEditSection(null)
      setDraft(null)
      toast.success("Profile updated!")
    } catch {
      toast.error("Failed to save changes")
    }
  }

  const uploadResume = async (file: File) => {
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch(`${API}/resume`, { method: "POST", body: fd })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setProfile(p => p ? { ...p, resume_path: data.resume_path } : p)
      toast.success(`Resume uploaded: ${data.filename}`)
    } catch {
      toast.error("Resume upload failed")
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
    </div>
  )
  if (!profile) return null

  const initials = profile.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "NG"

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* ── HEADER CARD ──────────────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-zinc-900 via-zinc-900 to-violet-950/30 rounded-2xl border border-white/10 p-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-transparent pointer-events-none" />
        <div className="relative flex items-start gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0 shadow-lg shadow-violet-900/40">
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            {editSection === "personal" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "full_name", placeholder: "Full name" },
                    { key: "email", placeholder: "Email" },
                    { key: "phone", placeholder: "Phone" },
                    { key: "location", placeholder: "Location" },
                    { key: "linkedin_url", placeholder: "LinkedIn URL" },
                    { key: "github_url", placeholder: "GitHub URL" },
                    { key: "website_url", placeholder: "Website URL" },
                  ].map(f => (
                    <input key={f.key} value={draft[f.key] || ""} placeholder={f.placeholder}
                      onChange={e => setDraft({ ...draft, [f.key]: e.target.value })}
                      className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 w-full" />
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => saveSection("personal")} className="flex items-center gap-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors">
                    <Check size={14} /> Save
                  </button>
                  <button onClick={cancelEdit} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-sm font-medium transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-zinc-100">{profile.full_name}</h1>
                    <p className="text-violet-400 text-sm mt-0.5 font-medium">AI & ML Engineer</p>
                  </div>
                  <button onClick={() => startEdit("personal")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-medium transition-colors border border-white/10">
                    <Edit3 size={12} /> Edit
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
                  {profile.email && <a href={`mailto:${profile.email}`} className="flex items-center gap-1.5 hover:text-violet-400 transition-colors"><Mail size={13} />{profile.email}</a>}
                  {profile.phone && <span className="flex items-center gap-1.5"><Phone size={13} />{profile.phone}</span>}
                  {profile.location && <span className="flex items-center gap-1.5"><MapPin size={13} />{profile.location}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-3">
                  {profile.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-violet-400 transition-colors"><Link2 size={13} />LinkedIn</a>}
                  {profile.github_url && <a href={profile.github_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-violet-400 transition-colors"><GitBranch size={13} />GitHub</a>}
                  {profile.website_url && <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-violet-400 transition-colors"><Globe size={13} />Website</a>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">

          {/* Summary */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <SectionHeader title="Summary" icon={<User size={16} />}
              editing={editSection === "summary"}
              onEdit={() => startEdit("summary")}
              onSave={() => saveSection("summary")}
              onCancel={cancelEdit} />
            {editSection === "summary" ? (
              <textarea rows={5} value={draft || ""} onChange={e => setDraft(e.target.value)}
                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none" />
            ) : (
              <p className="text-sm text-zinc-400 leading-relaxed">{profile.summary}</p>
            )}
          </div>

          {/* Skills */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <SectionHeader title="Skills" icon={sectionIcon.skills}
              editing={editSection === "skills"}
              onEdit={() => startEdit("skills")}
              onSave={() => saveSection("skills")}
              onCancel={cancelEdit} />
            {editSection === "skills" ? (
              <div className="space-y-4">
                {Object.entries(draft as Record<string, string[]>).map(([cat, tags]) => (
                  <div key={cat}>
                    <p className="text-xs text-zinc-500 mb-2 font-medium">{cat}</p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {tags.map((t, i) => (
                        <Tag key={i} label={t} onRemove={() => {
                          const updated = { ...draft, [cat]: tags.filter((_, j) => j !== i) }
                          setDraft(updated)
                        }} />
                      ))}
                    </div>
                    <input placeholder={`Add ${cat} skill...`}
                      onKeyDown={e => {
                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                          setDraft({ ...draft, [cat]: [...tags, e.currentTarget.value.trim()] })
                          e.currentTarget.value = ""
                        }
                      }}
                      className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(profile.skills || {}).map(([cat, tags]) => (
                  <div key={cat}>
                    <p className="text-[10px] text-zinc-500 mb-1.5 font-medium uppercase tracking-wider">{cat}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((t, i) => <Tag key={i} label={t} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resume */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
              <span className="text-violet-400"><FileText size={16} /></span>
              Resume
            </div>
            {profile.resume_path ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2 border border-white/10">
                  <FileText size={14} className="text-violet-400 flex-shrink-0" />
                  <span className="text-xs text-zinc-300 truncate">{profile.resume_path.split("/").pop()}</span>
                </div>
                <a href={`${API}/resume`} download
                  className="flex items-center gap-2 w-full justify-center px-3 py-2 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 rounded-lg text-xs font-medium transition-colors">
                  <Download size={13} /> Download Resume
                </a>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 mb-3">No resume uploaded yet.</p>
            )}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 border-2 border-dashed border-white/10 hover:border-violet-500/40 rounded-xl p-4 text-center cursor-pointer transition-colors group">
              <Upload size={20} className="mx-auto text-zinc-500 group-hover:text-violet-400 transition-colors mb-1" />
              <p className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
                {profile.resume_path ? "Update resume" : "Upload resume"} (PDF or DOCX)
              </p>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadResume(f) }} />
          </div>


          {/* Education */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <SectionHeader title="Education" icon={sectionIcon.education}
              editing={editSection === "education"}
              onEdit={() => startEdit("education")}
              onSave={() => saveSection("education")}
              onCancel={cancelEdit} />
            {editSection === "education" ? (
              <div className="space-y-4">
                {(draft as Education[]).map((edu, i) => (
                  <div key={i} className="bg-zinc-800 rounded-xl p-4 border border-white/10 space-y-2">
                    {(["degree", "institution", "duration", "score"] as const).map(field => (
                      <input key={field} value={edu[field]} placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                        onChange={e => {
                          const updated = [...draft]; updated[i] = { ...updated[i], [field]: e.target.value }; setDraft(updated)
                        }}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                    ))}
                    <button onClick={() => setDraft(draft.filter((_: unknown, j: number) => j !== i))}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                ))}
                <button onClick={() => setDraft([...draft, { degree: "", institution: "", duration: "", score: "" }])}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  <Plus size={13} /> Add Education
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {profile.education.map((edu, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <GraduationCap size={16} className="text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{edu.degree}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{edu.institution}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-zinc-500">{edu.duration}</span>
                        {edu.score && <span className="text-xs text-violet-400 font-medium">{edu.score}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Experience */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <SectionHeader title="Experience" icon={sectionIcon.experience}
              editing={editSection === "experience"}
              onEdit={() => startEdit("experience")}
              onSave={() => saveSection("experience")}
              onCancel={cancelEdit} />
            {editSection === "experience" ? (
              <div className="space-y-4">
                {(draft as Experience[]).map((exp, i) => (
                  <div key={i} className="bg-zinc-800 rounded-xl p-4 border border-white/10 space-y-2">
                    {(["role", "company", "duration"] as const).map(field => (
                      <input key={field} value={exp[field]} placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                        onChange={e => { const u = [...draft]; u[i] = { ...u[i], [field]: e.target.value }; setDraft(u) }}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                    ))}
                    <div>
                      <p className="text-[10px] text-zinc-500 mb-1 font-medium">Responsibilities (one per line)</p>
                      <textarea rows={4} value={exp.responsibilities.join("\n")}
                        onChange={e => { const u = [...draft]; u[i] = { ...u[i], responsibilities: e.target.value.split("\n") }; setDraft(u) }}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 resize-none" />
                    </div>
                    <button onClick={() => setDraft(draft.filter((_: unknown, j: number) => j !== i))}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                ))}
                <button onClick={() => setDraft([...draft, { role: "", company: "", duration: "", responsibilities: [""], tech: [] }])}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  <Plus size={13} /> Add Experience
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {profile.experience.map((exp, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Briefcase size={16} className="text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-zinc-100">{exp.role}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-zinc-400">{exp.company}</span>
                        <span className="text-zinc-700">·</span>
                        <span className="text-xs text-zinc-500">{exp.duration}</span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {exp.responsibilities.filter(Boolean).map((r, j) => (
                          <li key={j} className="text-xs text-zinc-400 flex gap-2">
                            <span className="text-violet-500 mt-0.5 flex-shrink-0">•</span>{r}
                          </li>
                        ))}
                      </ul>
                      {exp.tech?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {exp.tech.map((t, j) => <Tag key={j} label={t} />)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Projects */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <SectionHeader title="Projects" icon={sectionIcon.projects}
              editing={editSection === "projects"}
              onEdit={() => startEdit("projects")}
              onSave={() => saveSection("projects")}
              onCancel={cancelEdit} />
            {editSection === "projects" ? (
              <div className="space-y-4">
                {(draft as Project[]).map((proj, i) => (
                  <div key={i} className="bg-zinc-800 rounded-xl p-4 border border-white/10 space-y-2">
                    {(["title", "year"] as const).map(field => (
                      <input key={field} value={proj[field]} placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                        onChange={e => { const u = [...draft]; u[i] = { ...u[i], [field]: e.target.value }; setDraft(u) }}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                    ))}
                    <textarea rows={2} value={proj.description} placeholder="Description"
                      onChange={e => { const u = [...draft]; u[i] = { ...u[i], description: e.target.value }; setDraft(u) }}
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none" />
                    <button onClick={() => setDraft(draft.filter((_: unknown, j: number) => j !== i))}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                ))}
                <button onClick={() => setDraft([...draft, { title: "", year: "", description: "", tech: [] }])}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  <Plus size={13} /> Add Project
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {profile.projects.map((proj, i) => (
                  <div key={i} className="bg-zinc-800/50 rounded-xl p-4 border border-white/10 hover:border-violet-500/20 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-100">{proj.title}</p>
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full border border-white/10 flex-shrink-0">{proj.year}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{proj.description}</p>
                    {proj.tech?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {proj.tech.map((t, j) => <Tag key={j} label={t} />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Certifications */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <SectionHeader title="Certifications" icon={sectionIcon.certifications}
              editing={editSection === "certifications"}
              onEdit={() => startEdit("certifications")}
              onSave={() => saveSection("certifications")}
              onCancel={cancelEdit} />
            {editSection === "certifications" ? (
              <div className="space-y-3">
                {(draft as Certification[]).map((cert, i) => (
                  <div key={i} className="bg-zinc-800 rounded-xl p-4 border border-white/10 space-y-2">
                    {(["name", "issuer", "year", "credential_url"] as const).map(field => (
                      <input key={field} value={(cert as Record<string, unknown>)[field] as string || ""} placeholder={field === "credential_url" ? "Credential URL (optional)" : field.charAt(0).toUpperCase() + field.slice(1)}
                        onChange={e => { const u = [...draft]; u[i] = { ...u[i], [field]: e.target.value }; setDraft(u) }}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                    ))}
                    <button onClick={() => setDraft(draft.filter((_: unknown, j: number) => j !== i))}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                ))}
                <button onClick={() => setDraft([...draft, { name: "", issuer: "", year: "", credential_url: "" }])}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  <Plus size={13} /> Add Certification
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profile.certifications.map((cert, i) => (
                  <div key={i} className="bg-zinc-800/50 rounded-xl p-4 border border-yellow-500/10 hover:border-yellow-500/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
                        <Award size={14} className="text-yellow-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-100 leading-snug">{cert.name}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{cert.issuer}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-zinc-500">{cert.year}</span>
                          {cert.badge && <span className="text-[10px] text-yellow-400 font-medium">{cert.badge}</span>}
                          {cert.credential_url && (
                            <a href={cert.credential_url} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-0.5">
                              <ExternalLink size={9} /> View
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Publications */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <SectionHeader title="Publications" icon={sectionIcon.publications}
              editing={editSection === "publications"}
              onEdit={() => startEdit("publications")}
              onSave={() => saveSection("publications")}
              onCancel={cancelEdit} />
            {editSection === "publications" ? (
              <div className="space-y-3">
                {(draft as Publication[]).map((pub, i) => (
                  <div key={i} className="bg-zinc-800 rounded-xl p-4 border border-white/10 space-y-2">
                    <select value={pub.type} onChange={e => { const u = [...draft]; u[i] = { ...u[i], type: e.target.value }; setDraft(u) }}
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500">
                      {["Conference Paper", "Journal Paper", "Book Chapter", "Patent", "Workshop Paper"].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {(["title", "venue", "year"] as const).map(field => (
                      <input key={field} value={pub[field] || ""} placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                        onChange={e => { const u = [...draft]; u[i] = { ...u[i], [field]: e.target.value }; setDraft(u) }}
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                    ))}
                    <button onClick={() => setDraft(draft.filter((_: unknown, j: number) => j !== i))}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                      <Trash2 size={11} /> Remove
                    </button>
                  </div>
                ))}
                <button onClick={() => setDraft([...draft, { type: "Conference Paper", title: "", venue: "", year: "" }])}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  <Plus size={13} /> Add Publication
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {profile.publications.map((pub, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium flex-shrink-0 mt-0.5">{pub.type}</span>
                    <div>
                      <p className="text-xs text-zinc-200 leading-snug font-medium">{pub.title}</p>
                      {(pub.venue || pub.year) && (
                        <p className="text-[11px] text-zinc-500 mt-0.5">{[pub.venue, pub.year].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Achievements */}
          <div className="bg-zinc-900 rounded-2xl border border-white/10 p-5">
            <SectionHeader title="Achievements" icon={sectionIcon.achievements}
              editing={editSection === "achievements"}
              onEdit={() => startEdit("achievements")}
              onSave={() => saveSection("achievements")}
              onCancel={cancelEdit} />
            {editSection === "achievements" ? (
              <div className="space-y-2">
                {(draft as string[]).map((ach, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={ach} onChange={e => { const u = [...draft]; u[i] = e.target.value; setDraft(u) }}
                      className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500" />
                    <button onClick={() => setDraft(draft.filter((_: unknown, j: number) => j !== i))}
                      className="text-zinc-500 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={() => setDraft([...draft, ""])}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors mt-1">
                  <Plus size={13} /> Add Achievement
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {profile.achievements.map((ach, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-zinc-400">
                    <span className="text-violet-500 flex-shrink-0 mt-0.5">🏆</span>{ach}
                  </li>
                ))}
              </ul>
            )}
          </div>

      </div>
    </div>
  )
}
