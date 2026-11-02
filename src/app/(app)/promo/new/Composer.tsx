"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buildSmsBody, emailFooter, mergeName } from "@/lib/compliance";
import { countSms, estimateCostCents } from "@/lib/sms";
import { EXCLUSION_LABELS, type ExclusionReason, type SegmentKey } from "@/lib/segments";
import type { PromoTemplate } from "@/lib/templates";
import { SHOP } from "@/lib/constants";
import { formatShopTime, isWithinSmsWindow, nextSmsWindowStart, parseLocalDateTime, toLocalInputValue } from "@/lib/time";
import { sendCampaignAction } from "../actions";

type ChannelAudience = { recipients: number; excluded: Record<ExclusionReason, number>; sampleName: string; longestName: string };
export type SegmentOption = { key: SegmentKey; label: string; hint: string; size: number; sms: ChannelAudience; email: ChannelAudience };

const num = (n: number) => n.toLocaleString("en-CA");
const usd = (cents: number) => `US$${(cents / 100).toFixed(2)}`;

/** Characters that force UCS-2 (70-char segments), with plain replacements. */
const SMART: Record<string, string> = { "—": "-", "–": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "...", "•": "-" };

export function Composer({ segments, templates, testMode }: { segments: SegmentOption[]; templates: PromoTemplate[]; testMode: boolean }) {
  const router = useRouter();
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [segmentKey, setSegmentKey] = useState<SegmentKey>("lapsed_30_90");
  const [templateKey, setTemplateKey] = useState<string>("win_back");
  const initial = templates.find((t) => t.key === "win_back") ?? templates[0];
  const [name, setName] = useState(initial.name);
  const [smsBody, setSmsBody] = useState(initial.sms);
  const [emailBody, setEmailBody] = useState(initial.email);
  const [subject, setSubject] = useState(initial.emailSubject);
  const [promoCode, setPromoCode] = useState(initial.promoCode);
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduleLocal, setScheduleLocal] = useState(() => toLocalInputValue(new Date(Date.now() + 3600_000)));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const seg = segments.find((s) => s.key === segmentKey)!;
  const aud = seg[channel];
  const body = channel === "sms" ? smsBody : emailBody;
  const setBody = channel === "sms" ? setSmsBody : setEmailBody;

  function applyTemplate(t: PromoTemplate) {
    setTemplateKey(t.key);
    setName(t.name);
    setSmsBody(t.sms);
    setEmailBody(t.email);
    setSubject(t.emailSubject);
    setPromoCode(t.promoCode);
  }

  // SMS: count the final text (shop name + STOP footer added) using the longest first name in the segment
  const finalSms = buildSmsBody(smsBody, aud.sampleName);
  const worst = countSms(buildSmsBody(smsBody, aud.longestName));
  const smart = [...new Set([...smsBody].filter((ch) => ch in SMART || /\p{Extended_Pictographic}/u.test(ch)))];
  const cost = channel === "sms" ? estimateCostCents("sms", aud.recipients, worst.segments) : estimateCostCents("email", aud.recipients);
  const excludedTotal = Object.values(aud.excluded).reduce((a, b) => a + b, 0);

  const when = useMemo(() => {
    const at = sendMode === "now" ? new Date() : parseLocalDateTime(scheduleLocal);
    if (!at) return { at: null, moved: false };
    if (channel === "sms" && !isWithinSmsWindow(at)) return { at: nextSmsWindowStart(at), moved: true };
    return { at, moved: false };
  }, [sendMode, scheduleLocal, channel]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await sendCampaignAction({
        name,
        channel,
        segment: segmentKey,
        subject,
        body,
        promoCode,
        sendMode,
        scheduleLocal,
      });
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
        return;
      }
      router.push(`/promo/${res.id}`);
    });
  }

  const insertName = () => setBody(`${body}${body.endsWith(" ") || !body ? "" : " "}{name}`);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <Link href="/promo" className="text-sm text-brand">
          ← Promos
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">New promo</h1>
      </div>

      {/* channel */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1" role="radiogroup" aria-label="Channel">
        {(["sms", "email"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={channel === c}
            onClick={() => setChannel(c)}
            className={`rounded-lg py-2 font-medium ${channel === c ? "bg-brand text-brand-ink" : "text-ink-2"}`}
          >
            {c === "sms" ? "Text (SMS)" : "Email"}
          </button>
        ))}
      </div>

      {/* segment */}
      <Section title="1. Who gets it">
        <div className="space-y-2" role="radiogroup" aria-label="Segment">
          {segments.map((s) => {
            const active = s.key === segmentKey;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSegmentKey(s.key)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left ${
                  active ? "border-brand bg-card-2" : "border-line"
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{s.label}</span>
                  <span className="block truncate text-xs text-muted">{s.hint}</span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  <span className="font-semibold">{num(s[channel].recipients)}</span>
                  <span className="block text-xs text-muted">of {num(s.size)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {excludedTotal > 0 && (
          <div className="mt-3 rounded-xl bg-card-2 p-3 text-sm">
            <div className="font-medium">
              {num(excludedTotal)} left out automatically <span className="font-normal text-muted">(CASL)</span>
            </div>
            <ul className="mt-1 text-muted">
              {(Object.keys(aud.excluded) as ExclusionReason[])
                .filter((k) => aud.excluded[k] > 0)
                .map((k) => (
                  <li key={k} className="flex justify-between">
                    <span>{EXCLUSION_LABELS[k]}</span>
                    <span className="tabular-nums">{num(aud.excluded[k])}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </Section>

      {/* message */}
      <Section title="2. Message">
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => applyTemplate(t)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                templateKey === t.key ? "border-brand bg-brand text-brand-ink" : "border-line text-ink-2"
              }`}
            >
              {t.name}
              {t.bestFor === segmentKey && templateKey !== t.key ? " ★" : ""}
            </button>
          ))}
        </div>

        <Field label="Promo name (only you see this)">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} />
        </Field>

        {channel === "email" && (
          <Field label="Subject">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} maxLength={150} />
          </Field>
        )}

        <Field
          label={channel === "sms" ? "Text" : "Email"}
          right={
            <button type="button" onClick={insertName} className="text-xs font-medium text-brand">
              + Insert {"{name}"}
            </button>
          }
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={channel === "sms" ? 4 : 9}
            className={`${inputCls} resize-y leading-snug`}
          />
        </Field>

        {channel === "sms" && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted tabular-nums">
            <span>
              {worst.units} chars incl. footer · <span className={worst.segments > 2 ? "font-semibold text-warn" : ""}>{worst.segments} segment{worst.segments === 1 ? "" : "s"}</span> ·{" "}
              {worst.encoding}
            </span>
            <span>{worst.segments === 1 ? `${160 - worst.units} left` : `${worst.perSegment} per segment`}</span>
          </div>
        )}
        {channel === "sms" && smart.length > 0 && (
          <div className="mt-2 rounded-xl border border-warn/40 p-2 text-xs text-warn">
            ! {smart.join(" ")} switch the text to Unicode (70 characters per segment), which roughly doubles the cost.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setSmsBody([...smsBody].map((ch) => SMART[ch] ?? (/\p{Extended_Pictographic}/u.test(ch) ? "" : ch)).join("").replace(/  +/g, " "))}
            >
              Fix it
            </button>
          </div>
        )}

        <Field label="Promo code (to track what worked)">
          <input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            className={`${inputCls} font-mono`}
            maxLength={15}
            placeholder="optional, e.g. COMEBACK"
          />
        </Field>
        {promoCode && !body.toUpperCase().includes(promoCode) && (
          <p className="mt-1 text-xs text-warn">! The message doesn&apos;t mention {promoCode}.</p>
        )}
      </Section>

      {/* preview */}
      <Section title="Preview">
        {channel === "sms" ? <PhonePreview text={finalSms} /> : <EmailPreview subject={mergeName(subject, aud.sampleName)} body={mergeName(emailBody, aud.sampleName)} />}
        <p className="mt-2 text-center text-xs text-muted">
          Shown for “{aud.sampleName}”. {channel === "sms" ? "Shop name and “Reply STOP to opt out” are added automatically." : "Footer with address and unsubscribe link is added automatically."}
        </p>
      </Section>

      {/* when */}
      <Section title="3. When">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-line p-1">
          {(["now", "schedule"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSendMode(m)}
              aria-pressed={sendMode === m}
              className={`rounded-lg py-2 text-sm font-medium ${sendMode === m ? "bg-card-2 text-ink" : "text-muted"}`}
            >
              {m === "now" ? "Send now" : "Schedule"}
            </button>
          ))}
        </div>
        {sendMode === "schedule" && (
          <Field label="Date & time (London, ON)">
            <input type="datetime-local" value={scheduleLocal} onChange={(e) => setScheduleLocal(e.target.value)} className={inputCls} />
          </Field>
        )}
        {when.moved && when.at && (
          <p className="mt-2 rounded-xl border border-warn/40 p-2 text-sm text-warn">
            ◷ Quiet hours: texts only go out 9am–9pm. This will send {formatShopTime(when.at)}
          </p>
        )}
        {channel === "sms" && !when.moved && (
          <p className="mt-2 text-xs text-muted">Texts are only sent between 9am and 9pm. Fri/Sat late-night promos work best sent around 6–8pm.</p>
        )}
      </Section>

      {/* summary */}
      <div className="rounded-2xl border border-line bg-card p-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-ink-2">Recipients</dt>
            <dd className="text-xl font-bold tabular-nums">{num(aud.recipients)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-2">{channel === "sms" ? "Segments" : "Emails"}</dt>
            <dd className="text-xl font-bold tabular-nums">{num(channel === "sms" ? aud.recipients * worst.segments : aud.recipients)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-2">Est. cost</dt>
            <dd className="text-xl font-bold tabular-nums">{usd(cost)}</dd>
          </div>
        </dl>
        {testMode && <p className="mt-2 text-center text-xs text-warn">Test mode: nothing reaches real phones or inboxes.</p>}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-bad/40 p-3 text-sm text-bad">
          ✕ {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={aud.recipients === 0 || !body.trim() || pending}
        className="w-full rounded-xl bg-brand py-3.5 text-lg font-semibold text-brand-ink disabled:opacity-50"
      >
        {aud.recipients === 0 ? "No one to send to" : sendMode === "now" && !when.moved ? `Send to ${num(aud.recipients)}` : `Schedule for ${num(aud.recipients)}`}
      </button>

      {confirming && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
            <h2 id="confirm-title" className="text-lg font-semibold">
              {sendMode === "now" && !when.moved ? "Send this promo now?" : "Schedule this promo?"}
            </h2>
            <ul className="mt-3 space-y-1 text-sm text-ink-2">
              <li>
                {channel === "sms" ? "Text" : "Email"} to <b className="text-ink">{num(aud.recipients)}</b> {seg.label.toLowerCase()} customers
              </li>
              <li>{when.at ? (sendMode === "now" && !when.moved ? "Goes out right away" : `Goes out ${formatShopTime(when.at)}`) : ""}</li>
              <li>Est. cost {usd(cost)}</li>
              {testMode && <li className="text-warn">Test mode: messages are simulated.</li>}
            </ul>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-xl border border-line py-3 font-medium">
                Back
              </button>
              <button type="button" onClick={submit} disabled={pending} className="flex-1 rounded-xl bg-brand py-3 font-semibold text-brand-ink disabled:opacity-60">
                {pending ? "Sending…" : sendMode === "now" && !when.moved ? "Send" : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "mt-1 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-base outline-none focus:border-brand";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="flex items-baseline justify-between text-sm text-ink-2">
        {label}
        {right}
      </span>
      {children}
    </label>
  );
}

function PhonePreview({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-[280px] rounded-[2rem] border-4 border-ink/80 bg-surface p-3 pt-5">
      <div className="mb-3 text-center text-xs text-muted">
        <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-ink">P</div>
        {SHOP.name}
      </div>
      <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-card-2 px-3 py-2 text-[15px] leading-snug whitespace-pre-wrap break-words">{text}</div>
      <div className="mt-1 text-[10px] text-muted">Text message</div>
    </div>
  );
}

function EmailPreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="border-b border-line bg-card-2 px-3 py-2 text-sm">
        <div className="text-muted">From {SHOP.name}</div>
        <div className="font-semibold">{subject || "(no subject)"}</div>
      </div>
      <div className="px-3 py-3 text-sm whitespace-pre-wrap">{body}</div>
      <div className="border-t border-line px-3 py-2 text-xs whitespace-pre-wrap text-muted">{emailFooter("Unsubscribe link").replace("Unsubscribe: Unsubscribe link", "Unsubscribe")}</div>
    </div>
  );
}
