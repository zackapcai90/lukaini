"use client";

import React, { useState } from "react";
import { Footprints, CheckCircle2, Loader2 } from "lucide-react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabaseConfig";

const theme = {
  paper: "#F6F4EF", ink: "#16261F", inkSoft: "#3F4F49",
  pine: "#2F5D50", pineDark: "#1F4038", moss: "#8DA491",
  linen: "#EAE6DB", linenDark: "#DCD6C7", white: "#FFFFFF", rose: "#B14B3F",
};

const inputStyle = { fontFamily: "Inter, sans-serif", border: `1px solid ${theme.linenDark}`, backgroundColor: theme.white };
const inputClass = "w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-2";

function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs mb-1" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>{label}</span>
      {children}
    </label>
  );
}

export default function BookingForm() {
  const [form, setForm] = useState({ full_name: "", phone: "", address: "", wound_description: "", preferred_date: "", preferred_time: "" });
  const [status, setStatus] = useState("idle"); // idle | saving | done | error
  const [error, setError] = useState("");

  const submit = async () => {
    setStatus("saving"); setError("");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/booking_requests`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.msg || "Could not submit request");
      }
      setStatus("done");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: theme.paper }}>
        <div className="w-full max-w-md rounded-xl p-8 text-center" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
          <CheckCircle2 size={28} style={{ color: theme.pine, margin: "0 auto" }} />
          <div className="text-xl mt-3 mb-2" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>Request received</div>
          <div className="text-sm" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
            We'll contact you shortly to confirm your visit time.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: theme.paper }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');`}</style>
      <div className="w-full max-w-md rounded-xl p-7" style={{ backgroundColor: theme.white, border: `1px solid ${theme.linenDark}` }}>
        <Footprints size={20} style={{ color: theme.pine }} />
        <div className="text-xl mt-3 mb-1" style={{ fontFamily: "'Fraunces', serif", color: theme.ink }}>Book a home wound care visit</div>
        <div className="text-xs mb-5" style={{ color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
          Fill this in and we'll confirm your appointment time with you directly.
        </div>

        <Field label="Full name">
          <input className={inputClass} style={inputStyle} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Phone number">
          <input className={inputClass} style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Home address">
          <textarea rows={2} className={inputClass} style={inputStyle} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="Briefly describe the wound">
          <textarea rows={2} className={inputClass} style={inputStyle} placeholder="e.g. wound on left heel, diabetic, present for 3 weeks"
            value={form.wound_description} onChange={(e) => setForm({ ...form, wound_description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preferred date">
            <input type="date" className={inputClass} style={inputStyle} value={form.preferred_date} onChange={(e) => setForm({ ...form, preferred_date: e.target.value })} />
          </Field>
          <Field label="Preferred time">
            <input className={inputClass} style={inputStyle} placeholder="e.g. morning" value={form.preferred_time} onChange={(e) => setForm({ ...form, preferred_time: e.target.value })} />
          </Field>
        </div>

        {error && <div className="text-xs mb-3" style={{ color: theme.rose, fontFamily: "Inter, sans-serif" }}>{error}</div>}

        <button
          disabled={!form.full_name || !form.phone || status === "saving"}
          onClick={submit}
          className="w-full mt-1 px-4 py-2.5 rounded-md text-sm flex items-center justify-center gap-2"
          style={{ backgroundColor: theme.pine, color: theme.white, fontFamily: "Inter, sans-serif", opacity: (!form.full_name || !form.phone) ? 0.6 : 1 }}
        >
          {status === "saving" && <Loader2 size={13} className="animate-spin" />}
          Request appointment
        </button>
      </div>
    </div>
  );
}

