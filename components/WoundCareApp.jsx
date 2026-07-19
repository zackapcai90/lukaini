"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, ArrowLeft, X, Camera, AlertTriangle, LogOut,
  Clock, Wallet, ChevronRight, Activity, Phone,
  MapPin, Calendar as CalIcon, Footprints, Link2, Loader2, Inbox, Check
} from "lucide-react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabaseConfig";

const theme = {
  paper: "#F6F4EF", ink: "#16261F", inkSoft: "#3F4F49",
  pine: "#2F5D50", pineDark: "#1F4038", moss: "#8DA491",
  amber: "#C98A2C", rose: "#B14B3F", linen: "#EAE6DB",
  linenDark: "#DCD6C7", white: "#FFFFFF",
};

const WOUND_BED_OPTIONS = ["Granulation", "Slough", "Necrotic", "Epithelializing", "Mixed"];
const INFECTION_SIGNS = ["Redness", "Warmth", "Swelling", "Pain", "Purulent discharge", "Odor"];
const DRESSING_OPTIONS = ["Normal saline + gauze", "Hydrocolloid", "Foam dressing", "Silver dressing", "Alginate", "Other"];

// ---------- Supabase REST helpers (no SDK, just fetch) ----------

async function sbRequest({ url, anonKey, token, path, method = "GET", body, extraHeaders = {} }) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token || anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

async function sbSignUp({ url, anonKey, email, password }) {
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || data.error || JSON.stringify(data));
  return data;
}

async function sbSignIn({ url, anonKey, email, password }) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || data.error || JSON.stringify(data));
  return data;
}

function resizeImage(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- DB <-> UI shape mapping ----------

const dbToVisit = (row) => ({
  id: row.id,
  date: row.visit_date,
  length: row.size_length_cm,
  width: row.size_width_cm,
  depth: row.size_depth_cm,
  bed: row.wound_bed,
  exudate: row.exudate,
  infectionSigns: row.infection_signs || [],
  pain: row.pain_score,
  dressing: row.dressing_used,
  debridement: row.debridement_done,
  nextVisit: row.next_visit_date,
  escalation: row.escalation_flag,
  photo: row.photo_url,
  notes: row.clinical_notes,
  invoice: row.invoices?.[0] || null,
});

const dbToWound = (row) => ({
  id: row.id,
  location: row.location,
  wagnerGrade: row.wagner_grade,
  onset: row.onset_date,
  status: row.status,
  visits: (row.visits || []).slice().sort((a, b) => (a.visit_date || "").localeCompare(b.visit_date || "")).map(dbToVisit),
});

const dbToPatient = (row) => ({
  id: row.id,
  name: row.full_name,
  ic: row.ic_number,
  dob: row.dob,
  phone: row.phone,
  address: row.address,
  t2dmSince: row.t2dm_since,
  comorbidities: row.comorbidities || [],
  wounds: (row.wound_profiles || []).map(dbToWound),
});

function areaOf(v) { return (v.length || 0) * (v.width || 0); }
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- Small UI primitives ----------

function Pill({ children, tone = "moss" }) {
  const bg = { moss: theme.linen, amber: "#F3E3C8", rose: "#F0DAD5", pine: "#DCE7E1" }[tone];
  const fg = { moss: theme.inkSoft, amber: "#8A5D1D", rose: theme.rose, pine: theme.pineDark }[tone];
  return (
    <span className="px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1"
      style={{ backgroundColor: bg, color: fg, fontFamily: "Inter, sans-serif" }}>
      {children}
    </span>
  );
}

const inputStyle = { fontFamily: "Inter, sans-serif", border: `1px solid ${theme.linenDark}`, backgroundColor: theme.white };
const inputClass = "w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-2";

function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs mb-1" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ backgroundColor: "rgba(22,38,31,0.45)" }}>
      <div className={`w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-xl p-6 max-h-[90vh] overflow-y-auto`} style={{ backgroundColor: theme.paper }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>{title}</div>
          <button onClick={onClose}><X size={18} style={{ color: theme.inkSoft }} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSave, disabled, saveLabel, saving }) {
  return (
    <div className="flex justify-end gap-2 mt-4">
      <button onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ fontFamily: "Inter, sans-serif", color: theme.inkSoft }}>Cancel</button>
      <button disabled={disabled || saving} onClick={onSave} className="px-4 py-2 rounded-md text-sm flex items-center gap-2"
        style={{ fontFamily: "Inter, sans-serif", backgroundColor: disabled ? theme.linenDark : theme.pine, color: theme.white, opacity: disabled ? 0.7 : 1 }}>
        {saving && <Loader2 size={13} className="animate-spin" />}
        {saveLabel}
      </button>
    </div>
  );
}

// ---------- Connect + Auth screens ----------

function AuthScreen({ config, onSignedIn }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const submit = async () => {
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "signup") {
        const data = await sbSignUp({ ...config, email, password });
        if (data.access_token) {
          onSignedIn({ accessToken: data.access_token, refreshToken: data.refresh_token, userId: data.user.id, email });
        } else {
          setNotice("Account created. If email confirmation is enabled on your project, confirm via email, then sign in.");
          setMode("signin");
        }
      } else {
        const data = await sbSignIn({ ...config, email, password });
        onSignedIn({ accessToken: data.access_token, refreshToken: data.refresh_token, userId: data.user.id, email });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.paper }}>
      <div className="w-full max-w-md rounded-xl p-7" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
        <div className="text-xl mb-1" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>
          {mode === "signin" ? "Sign in" : "Create your account"}
        </div>
        <div className="text-xs mb-5" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
          This is your provider login — one account for your practice.
        </div>
        <Field label="Email">
          <input type="email" className={inputClass} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" className={inputClass} style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <div className="text-xs mb-3" style={{ color: theme.rose, fontFamily: "Inter, sans-serif" }}>{error}</div>}
        {notice && <div className="text-xs mb-3" style={{ color: theme.pine, fontFamily: "Inter, sans-serif" }}>{notice}</div>}
        <button disabled={!email || !password || busy} onClick={submit}
          className="w-full px-4 py-2.5 rounded-md text-sm flex items-center justify-center gap-2"
          style={{ backgroundColor: theme.pine, color: theme.white, fontFamily: "Inter, sans-serif", opacity: (!email || !password || busy) ? 0.7 : 1 }}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          {mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="w-full mt-3 text-xs" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
          {mode === "signin" ? "No account yet? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// ---------- Sidebar / Dashboard / Patients (mostly as before) ----------

function Sidebar({ view, setView, patientCount, email, onSignOut, pendingCount }) {
  const items = [
    { key: "dashboard", label: "Dashboard", icon: Activity },
    { key: "requests", label: "Requests", icon: Inbox, badge: pendingCount },
    { key: "patients", label: "Patients", icon: Footprints },
  ];
  return (
    <div className="w-56 shrink-0 flex flex-col h-full" style={{ backgroundColor: theme.pineDark }}>
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: `1px solid ${theme.pine}` }}>
        <div className="text-xs tracking-widest uppercase" style={{ color: theme.moss, fontFamily: "Inter, sans-serif" }}>House Call</div>
        <div className="text-xl mt-0.5" style={{ color: theme.white, fontFamily: "'Fraunces', serif" }}>Wound Care</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} onClick={() => setView(key)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors"
            style={{ fontFamily: "Inter, sans-serif", backgroundColor: view === key ? theme.pine : "transparent", color: view === key ? theme.white : theme.moss }}>
            <span className="flex items-center gap-3"><Icon size={16} />{label}</span>
            {!!badge && (
              <span className="text-xs px-1.5 rounded-full" style={{ backgroundColor: theme.amber, color: theme.white, fontFamily: "'IBM Plex Mono', monospace" }}>{badge}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs" style={{ color: theme.moss, fontFamily: "Inter, sans-serif", borderTop: `1px solid ${theme.pine}` }}>
        <div className="mb-2">{patientCount} active patient{patientCount === 1 ? "" : "s"}</div>
        <div className="flex items-center justify-between">
          <span className="truncate" style={{ maxWidth: 120 }}>{email}</span>
          <button onClick={onSignOut} title="Sign out"><LogOut size={13} /></button>
        </div>
      </div>
    </div>
  );
}

function WoundTimeline({ wound }) {
  const visits = wound.visits;
  const maxArea = Math.max(1, ...visits.map(areaOf));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-base" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>{wound.location}</div>
          <div className="text-xs mt-0.5" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>Wagner grade {wound.wagnerGrade} &middot; onset {wound.onset}</div>
        </div>
        <Pill tone={wound.status === "active" ? "amber" : "pine"}>{wound.status === "active" ? "Active" : "Healed"}</Pill>
      </div>
      {visits.length === 0 ? (
        <div className="text-sm rounded-md px-4 py-6 text-center" style={{ backgroundColor: theme.linen, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
          No visits logged yet for this wound.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {visits.map((v, i) => {
            const barHeight = 8 + Math.round((areaOf(v) / maxArea) * 32);
            const isLast = i === visits.length - 1;
            return (
              <div key={v.id} className="shrink-0 w-40 rounded-lg overflow-hidden" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
                <div className="h-24 flex items-center justify-center" style={{ backgroundColor: theme.linen }}>
                  {v.photo ? <img src={v.photo} alt="wound" className="w-full h-full object-cover" /> : <Camera size={22} style={{ color: theme.moss }} />}
                </div>
                <div className="p-2.5">
                  <div className="text-xs" style={{ color: theme.inkSoft, fontFamily: "'IBM Plex Mono', monospace" }}>{v.date}</div>
                  <div className="flex items-end gap-1.5 mt-1.5 mb-1.5">
                    <div className="rounded-sm" style={{ width: 6, height: barHeight, backgroundColor: isLast ? theme.pine : theme.moss }} />
                    <div className="text-sm" style={{ fontFamily: "'IBM Plex Mono', monospace", color: theme.ink }}>{v.length}×{v.width}cm</div>
                  </div>
                  <div className="text-xs" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>{v.bed}</div>
                  {v.escalation && <div className="mt-1.5"><Pill tone="rose"><AlertTriangle size={10} /> Escalated</Pill></div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dashboard({ patients }) {
  const upcoming = [];
  const unpaid = [];
  patients.forEach((p) => p.wounds.forEach((w) => w.visits.forEach((v) => {
    if (v.nextVisit) upcoming.push({ patient: p.name, date: v.nextVisit, wound: w.location });
    if (v.invoice?.status === "unpaid") unpaid.push({ patient: p.name, amount: v.invoice.amount });
  })));
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  const unpaidTotal = unpaid.reduce((s, u) => s + Number(u.amount || 0), 0);
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl mb-6" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>Today's overview</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Active patients", value: patients.length, icon: Footprints },
          { label: "Upcoming visits", value: upcoming.length, icon: CalIcon },
          { label: "Unpaid invoices", value: `RM ${unpaidTotal.toFixed(0)}`, icon: Wallet },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg p-4" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
            <Icon size={16} style={{ color: theme.pine }} />
            <div className="text-2xl mt-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: theme.ink }}>{value}</div>
            <div className="text-xs mt-1" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>{label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
        <div className="px-4 py-3 text-sm" style={{ borderBottom: `1px solid ${theme.linenDark}`, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>Upcoming visits</div>
        {upcoming.length === 0 ? (
          <div className="px-4 py-6 text-sm text-center" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>Nothing scheduled yet.</div>
        ) : upcoming.slice(0, 8).map((u, i) => (
          <div key={i} className="px-4 py-3 flex items-center justify-between text-sm" style={{ borderTop: i ? `1px solid ${theme.linen}` : "none", fontFamily: "Inter, sans-serif" }}>
            <div><span style={{ color: theme.ink }}>{u.patient}</span><span style={{ color: theme.inkSoft }}> &middot; {u.wound}</span></div>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: theme.pine }}>{u.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PatientList({ patients, onSelect, onAdd }) {
  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>Patients</h1>
        <button onClick={onAdd} className="flex items-center gap-2 px-3.5 py-2 rounded-md text-sm" style={{ backgroundColor: theme.pine, color: theme.white, fontFamily: "Inter, sans-serif" }}>
          <Plus size={15} /> Add patient
        </button>
      </div>
      <div className="space-y-2">
        {patients.length === 0 && (
          <div className="text-sm rounded-lg px-4 py-8 text-center" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}`, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
            No patients yet — add your first one.
          </div>
        )}
        {patients.map((p) => {
          const activeWounds = p.wounds.filter((w) => w.status === "active").length;
          return (
            <button key={p.id} onClick={() => onSelect(p.id)} className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg text-left" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
              <div>
                <div className="text-sm" style={{ fontFamily: "Inter, sans-serif", color: theme.ink }}>{p.name}</div>
                <div className="text-xs mt-0.5 flex items-center gap-3" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
                  <span className="flex items-center gap-1"><Phone size={11} />{p.phone}</span>
                  <span className="flex items-center gap-1"><MapPin size={11} />{p.address?.split(",")[0]}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {activeWounds > 0 && <Pill tone="amber">{activeWounds} active wound{activeWounds > 1 ? "s" : ""}</Pill>}
                <ChevronRight size={16} style={{ color: theme.moss }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PatientDetail({ patient, onBack, onAddWound, onLogVisit }) {
  return (
    <div className="p-8 max-w-4xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-5" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
        <ArrowLeft size={14} /> All patients
      </button>
      <div className="rounded-lg p-5 mb-6" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
        <div className="text-xl mb-1" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>{patient.name}</div>
        <div className="text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
          <span>IC {patient.ic}</span><span>DOB {patient.dob}</span><span>{patient.phone}</span><span>T2DM since {patient.t2dmSince}</span>
        </div>
        <div className="text-xs mt-1" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>{patient.address}</div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm uppercase tracking-wide" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>Wound profiles</div>
        <button onClick={onAddWound} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs" style={{ backgroundColor: theme.linen, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
          <Plus size={13} /> New wound
        </button>
      </div>
      <div className="space-y-6">
        {patient.wounds.length === 0 ? (
          <div className="text-sm rounded-lg px-4 py-8 text-center" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}`, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
            No wound profiles yet. Add one to start logging visits.
          </div>
        ) : patient.wounds.map((w) => (
          <div key={w.id} className="rounded-lg p-5" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
            <WoundTimeline wound={w} />
            <button onClick={() => onLogVisit(w.id)} className="mt-4 flex items-center gap-2 px-3.5 py-2 rounded-md text-sm" style={{ backgroundColor: theme.pine, color: theme.white, fontFamily: "Inter, sans-serif" }}>
              <Plus size={14} /> Log visit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Modals that call Supabase ----------

function AddPatientModal({ onClose, onSave, saving, initial }) {
  const [form, setForm] = useState({ name: initial?.full_name || "", ic: "", dob: "", phone: initial?.phone || "", address: initial?.address || "", t2dmSince: "" });
  return (
    <Modal onClose={onClose} title="New patient">
      <Field label="Full name"><input className={inputClass} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="IC number"><input className={inputClass} style={inputStyle} value={form.ic} onChange={(e) => setForm({ ...form, ic: e.target.value })} /></Field>
        <Field label="Date of birth"><input type="date" className={inputClass} style={inputStyle} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
      </div>
      <Field label="Phone"><input className={inputClass} style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="Address"><textarea rows={2} className={inputClass} style={inputStyle} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field label="T2DM diagnosed since (year)"><input className={inputClass} style={inputStyle} value={form.t2dmSince} onChange={(e) => setForm({ ...form, t2dmSince: e.target.value })} /></Field>
      <ModalActions onClose={onClose} onSave={() => onSave(form)} disabled={!form.name} saving={saving} saveLabel="Add patient" />
    </Modal>
  );
}

function AddWoundModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState({ location: "", wagnerGrade: 1, onset: "" });
  return (
    <Modal onClose={onClose} title="New wound profile">
      <Field label="Location (e.g. left heel, right great toe)"><input className={inputClass} style={inputStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Wagner grade">
          <select className={inputClass} style={inputStyle} value={form.wagnerGrade} onChange={(e) => setForm({ ...form, wagnerGrade: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Onset date"><input type="date" className={inputClass} style={inputStyle} value={form.onset} onChange={(e) => setForm({ ...form, onset: e.target.value })} /></Field>
      </div>
      <ModalActions onClose={onClose} onSave={() => onSave(form)} disabled={!form.location} saving={saving} saveLabel="Add wound" />
    </Modal>
  );
}

function LogVisitModal({ onClose, onSave, saving }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10), length: "", width: "", depth: "",
    bed: WOUND_BED_OPTIONS[0], exudate: "", infectionSigns: [], pain: 3,
    dressing: DRESSING_OPTIONS[0], debridement: false, nextVisit: "",
    escalation: false, photo: null, notes: "", amount: "",
  });
  const toggleSign = (s) => setForm((f) => ({ ...f, infectionSigns: f.infectionSigns.includes(s) ? f.infectionSigns.filter((x) => x !== s) : [...f.infectionSigns, s] }));
  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file);
    setForm((f) => ({ ...f, photo: dataUrl }));
  };
  return (
    <Modal onClose={onClose} title="Log visit" wide>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Visit date"><input type="date" className={inputClass} style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Next visit date"><input type="date" className={inputClass} style={inputStyle} value={form.nextVisit} onChange={(e) => setForm({ ...form, nextVisit: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Length (cm)"><input type="number" step="0.1" className={inputClass} style={inputStyle} value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} /></Field>
        <Field label="Width (cm)"><input type="number" step="0.1" className={inputClass} style={inputStyle} value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} /></Field>
        <Field label="Depth (cm)"><input type="number" step="0.1" className={inputClass} style={inputStyle} value={form.depth} onChange={(e) => setForm({ ...form, depth: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Wound bed">
          <select className={inputClass} style={inputStyle} value={form.bed} onChange={(e) => setForm({ ...form, bed: e.target.value })}>
            {WOUND_BED_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Exudate"><input className={inputClass} style={inputStyle} placeholder="e.g. moderate, serous" value={form.exudate} onChange={(e) => setForm({ ...form, exudate: e.target.value })} /></Field>
      </div>
      <Field label="Signs of infection">
        <div className="flex flex-wrap gap-2">
          {INFECTION_SIGNS.map((s) => (
            <button type="button" key={s} onClick={() => toggleSign(s)} className="px-2.5 py-1 rounded-full text-xs"
              style={{ fontFamily: "Inter, sans-serif", backgroundColor: form.infectionSigns.includes(s) ? theme.rose : theme.linen, color: form.infectionSigns.includes(s) ? theme.white : theme.inkSoft }}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Dressing used">
          <select className={inputClass} style={inputStyle} value={form.dressing} onChange={(e) => setForm({ ...form, dressing: e.target.value })}>
            {DRESSING_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Pain score (0-10)">
          <input type="range" min={0} max={10} value={form.pain} onChange={(e) => setForm({ ...form, pain: Number(e.target.value) })} className="w-full" />
          <div className="text-xs mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: theme.inkSoft }}>{form.pain} / 10</div>
        </Field>
      </div>
      <div className="flex items-center gap-6 mb-3">
        <label className="flex items-center gap-2 text-sm" style={{ fontFamily: "Inter, sans-serif", color: theme.ink }}>
          <input type="checkbox" checked={form.debridement} onChange={(e) => setForm({ ...form, debridement: e.target.checked })} /> Debridement performed
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ fontFamily: "Inter, sans-serif", color: theme.rose }}>
          <input type="checkbox" checked={form.escalation} onChange={(e) => setForm({ ...form, escalation: e.target.checked })} /> Flag for escalation / referral
        </label>
      </div>
      <Field label="Wound photo">
        <div className="flex items-center gap-3">
          <label className="px-3 py-2 rounded-md text-sm cursor-pointer flex items-center gap-2" style={{ backgroundColor: theme.linen, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
            <Camera size={14} /> Choose photo
            <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </label>
          {form.photo && <img src={form.photo} alt="preview" className="w-12 h-12 rounded object-cover" />}
        </div>
      </Field>
      <Field label="Clinical notes"><textarea rows={2} className={inputClass} style={inputStyle} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <Field label="Visit fee (RM)"><input type="number" className={inputClass} style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
      <ModalActions onClose={onClose} onSave={() => onSave(form)} disabled={!form.length || !form.width} saving={saving} saveLabel="Save visit" />
    </Modal>
  );
}

function RequestsView({ requests, onAccept, onDecline, busyId }) {
  const pending = requests.filter((r) => r.status === "pending");
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl mb-6" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>Booking requests</h1>
      {pending.length === 0 ? (
        <div className="text-sm rounded-lg px-4 py-8 text-center" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}`, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
          No pending requests. Share your booking link with patients: <br />
          <code style={{ fontFamily: "'IBM Plex Mono', monospace" }}>yourapp.vercel.app/book</code>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => (
            <div key={r.id} className="rounded-lg p-4" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm" style={{ fontFamily: "Inter, sans-serif", color: theme.ink, fontWeight: 500 }}>{r.full_name}</div>
                  <div className="text-xs mt-0.5" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
                    {r.phone} &middot; {r.address}
                  </div>
                  {r.wound_description && (
                    <div className="text-xs mt-2" style={{ color: theme.ink, fontFamily: "Inter, sans-serif" }}>"{r.wound_description}"</div>
                  )}
                  {(r.preferred_date || r.preferred_time) && (
                    <div className="text-xs mt-2" style={{ color: theme.pine, fontFamily: "'IBM Plex Mono', monospace" }}>
                      Preferred: {r.preferred_date || "—"} {r.preferred_time || ""}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button disabled={busyId === r.id} onClick={() => onDecline(r.id)}
                    className="px-3 py-1.5 rounded-md text-xs" style={{ backgroundColor: theme.linen, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
                    Decline
                  </button>
                  <button disabled={busyId === r.id} onClick={() => onAccept(r)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs" style={{ backgroundColor: theme.pine, color: theme.white, fontFamily: "Inter, sans-serif" }}>
                    <Check size={12} /> Accept
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Main App ----------

export default function App() {
  const config = { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
  const [session, setSession] = useState(null);      // { accessToken, userId, email }
  const [patients, setPatients] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("dashboard");
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState(null);

  const selectedPatient = useMemo(() => patients.find((p) => p.id === selectedPatientId), [patients, selectedPatientId]);
  const pendingCount = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);

  const loadPatients = useCallback(async () => {
    if (!session) return;
    setLoading(true); setLoadError("");
    try {
      const [patientRows, requestRows] = await Promise.all([
        sbRequest({ ...config, token: session.accessToken, path: "/rest/v1/patients?select=*,wound_profiles(*,visits(*,invoices(*)))&order=created_at.desc" }),
        sbRequest({ ...config, token: session.accessToken, path: "/rest/v1/booking_requests?order=created_at.desc" }),
      ]);
      setPatients(patientRows.map(dbToPatient));
      setRequests(requestRows);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  const acceptRequest = async (request) => {
    setModal({ addPatientFrom: request });
  };

  const declineRequest = async (requestId) => {
    setBusyRequestId(requestId);
    try {
      await sbRequest({ ...config, token: session.accessToken, method: "PATCH", path: `/rest/v1/booking_requests?id=eq.${requestId}`, body: { status: "declined" } });
      setRequests((rs) => rs.map((r) => r.id === requestId ? { ...r, status: "declined" } : r));
    } catch (e) { setLoadError(e.message); } finally { setBusyRequestId(null); }
  };

  const addPatient = async (form, sourceRequestId) => {
    setSaving(true);
    try {
      const [row] = await sbRequest({
        ...config, token: session.accessToken, method: "POST", path: "/rest/v1/patients",
        body: { full_name: form.name, ic_number: form.ic, dob: form.dob || null, phone: form.phone, address: form.address, t2dm_since: form.t2dmSince, comorbidities: [] },
      });
      setPatients((ps) => [dbToPatient({ ...row, wound_profiles: [] }), ...ps]);
      if (sourceRequestId) {
        await sbRequest({ ...config, token: session.accessToken, method: "PATCH", path: `/rest/v1/booking_requests?id=eq.${sourceRequestId}`, body: { status: "confirmed" } });
        setRequests((rs) => rs.map((r) => r.id === sourceRequestId ? { ...r, status: "confirmed" } : r));
      }
      setModal(null);
    } catch (e) { setLoadError(e.message); } finally { setSaving(false); }
  };

  const addWound = async (form) => {
    setSaving(true);
    try {
      const [row] = await sbRequest({
        ...config, token: session.accessToken, method: "POST", path: "/rest/v1/wound_profiles",
        body: { patient_id: selectedPatientId, location: form.location, wagner_grade: form.wagnerGrade, onset_date: form.onset || null, status: "active" },
      });
      setPatients((ps) => ps.map((p) => p.id === selectedPatientId ? { ...p, wounds: [...p.wounds, dbToWound({ ...row, visits: [] })] } : p));
      setModal(null);
    } catch (e) { setLoadError(e.message); } finally { setSaving(false); }
  };

  const logVisit = async (woundId, form) => {
    setSaving(true);
    try {
      const [visitRow] = await sbRequest({
        ...config, token: session.accessToken, method: "POST", path: "/rest/v1/visits",
        body: {
          patient_id: selectedPatientId, wound_profile_id: woundId, visit_date: form.date,
          size_length_cm: Number(form.length), size_width_cm: Number(form.width), size_depth_cm: Number(form.depth) || 0,
          wound_bed: form.bed, exudate: form.exudate, infection_signs: form.infectionSigns, pain_score: form.pain,
          dressing_used: form.dressing, debridement_done: form.debridement, photo_url: form.photo,
          clinical_notes: form.notes, next_visit_date: form.nextVisit || null, escalation_flag: form.escalation,
        },
      });
      let invoiceRow = null;
      if (form.amount) {
        const [inv] = await sbRequest({
          ...config, token: session.accessToken, method: "POST", path: "/rest/v1/invoices",
          body: { patient_id: selectedPatientId, visit_id: visitRow.id, amount: Number(form.amount), status: "unpaid" },
        });
        invoiceRow = inv;
      }
      const uiVisit = dbToVisit({ ...visitRow, invoices: invoiceRow ? [invoiceRow] : [] });
      setPatients((ps) => ps.map((p) => p.id === selectedPatientId
        ? { ...p, wounds: p.wounds.map((w) => w.id === woundId ? { ...w, visits: [...w.visits, uiVisit] } : w) }
        : p));
      setModal(null);
    } catch (e) { setLoadError(e.message); } finally { setSaving(false); }
  };

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center" style={{ backgroundColor: theme.paper }}>
        <div className="max-w-md text-sm" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
          Missing Supabase configuration. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your Vercel project's Environment Variables, then redeploy.
        </div>
      </div>
    );
  }
  if (!session) return <AuthScreen config={config} onSignedIn={setSession} onDisconnect={() => {}} />;

  return (
    <div className="flex h-full w-full" style={{ backgroundColor: theme.paper, minHeight: "100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');`}</style>
      <Sidebar view={view} setView={(v) => { setView(v); setSelectedPatientId(null); }} patientCount={patients.length} email={session.email} onSignOut={() => setSession(null)} pendingCount={pendingCount} />
      <div className="flex-1 overflow-y-auto">
        {loadError && (
          <div className="m-6 px-4 py-3 rounded-md text-sm" style={{ backgroundColor: "#F0DAD5", color: theme.rose, fontFamily: "Inter, sans-serif" }}>
            {loadError}
          </div>
        )}
        {loading && patients.length === 0 ? (
          <div className="p-8 flex items-center gap-2 text-sm" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
            <Loader2 size={14} className="animate-spin" /> Loading your data…
          </div>
        ) : (
          <>
            {view === "dashboard" && <Dashboard patients={patients} />}
            {view === "requests" && <RequestsView requests={requests} onAccept={acceptRequest} onDecline={declineRequest} busyId={busyRequestId} />}
            {view === "patients" && !selectedPatient && <PatientList patients={patients} onSelect={setSelectedPatientId} onAdd={() => setModal("addPatient")} />}
            {view === "patients" && selectedPatient && (
              <PatientDetail patient={selectedPatient} onBack={() => setSelectedPatientId(null)} onAddWound={() => setModal("addWound")} onLogVisit={(id) => setModal({ logVisit: id })} />
            )}
          </>
        )}
      </div>
      {modal === "addPatient" && <AddPatientModal onClose={() => setModal(null)} onSave={(form) => addPatient(form)} saving={saving} />}
      {modal?.addPatientFrom && (
        <AddPatientModal onClose={() => setModal(null)} initial={modal.addPatientFrom} saving={saving}
          onSave={(form) => addPatient(form, modal.addPatientFrom.id)} />
      )}
      {modal === "addWound" && <AddWoundModal onClose={() => setModal(null)} onSave={addWound} saving={saving} />}
      {modal?.logVisit && <LogVisitModal onClose={() => setModal(null)} onSave={(form) => logVisit(modal.logVisit, form)} saving={saving} />}
    </div>
  );
}
