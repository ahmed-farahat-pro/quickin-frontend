'use client'

import { useState } from 'react'
import { CONTACT_EMAIL } from '@/lib/contact'

// The frontend has no backend of its own and there is no contact-message
// endpoint, so "Send" opens the visitor's mail app with the message addressed to
// our inbox and the fields filled in. Their reply-to is their own address.

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', ink: '#2A2220', muted: '#6B6055' }

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  fontSize: 15,
  fontFamily: 'inherit',
  color: C.ink,
  background: '#fff',
  border: '1px solid rgba(42,34,32,0.16)',
  borderRadius: 12,
  outline: 'none',
}

function Field({ en, ar, children }: { en: string; ar: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>
        {en} <span style={{ color: C.muted, fontWeight: 400 }}>|</span> <span dir="rtl">{ar}</span>
      </span>
      {children}
    </label>
  )
}

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = `${message.trim()}\n\n— ${name.trim()} (${email.trim()})`
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(body)}`
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
      <Field en="Full Name" ar="الاسم بالكامل">
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
      </Field>
      <Field en="Email Address" ar="البريد الإلكتروني">
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </Field>
      <Field en="Subject" ar="الموضوع">
        <input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </Field>
      <Field en="Message" ar="رسالتك">
        <textarea style={{ ...input, minHeight: 140, resize: 'vertical' }} value={message} onChange={(e) => setMessage(e.target.value)} required dir="auto" />
      </Field>
      <button
        type="submit"
        style={{
          justifySelf: 'start',
          padding: '12px 26px',
          fontSize: 15,
          fontWeight: 600,
          fontFamily: 'inherit',
          color: '#fff',
          background: C.burgundy,
          border: 'none',
          borderRadius: 999,
          cursor: 'pointer',
        }}
      >
        Send <span style={{ opacity: 0.6 }}>|</span> <span dir="rtl">إرسال</span>
      </button>
    </form>
  )
}
