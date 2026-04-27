import React from 'react';

// ── Visual config per section ────────────────────────────────────────────────
const SECTION_META = {
  'SESSION SNAPSHOT':  { accent: 'text-primary',              divider: 'bg-primary/30'        },
  'METRIC COMPARISON': { accent: 'text-muted-foreground',     divider: 'bg-border'            },
  'INTERPRETATION':    { accent: 'text-muted-foreground',     divider: 'bg-border'            },
  'NEXT DRILL':        { accent: 'text-amber-500',            divider: 'bg-amber-500/30',
                         card: 'border-amber-500/20 bg-amber-500/5'                           },
  "COACH'S NOTE":      { accent: 'text-emerald-500',          divider: 'bg-emerald-500/30',
                         card: 'border-emerald-500/20 bg-emerald-500/5'                       },
};

// Coloured labels for the three SESSION SNAPSHOT bullets
const SNAPSHOT_LABEL_COLORS = {
  'Biggest issue':   'text-rose-400',
  'Positive signal': 'text-emerald-400',
  'Key metric':      'text-primary',
};

// ── Line parser ──────────────────────────────────────────────────────────────
function parseLine(raw) {
  const line = raw.trim();
  const isBullet = line.startsWith('•');
  const isDash   = !isBullet && line.startsWith('-');

  if (isBullet || isDash) {
    const body      = line.slice(1).trim();
    // Split on first pipe for metric comparison notes: "label: comparison | note"
    const [main, note] = body.split('|').map(s => s.trim());
    const colonIdx  = main.indexOf(':');
    const hasLabel  = colonIdx > 0 && colonIdx < 50;
    return {
      type:  isBullet ? 'bullet' : 'dash',
      label: hasLabel ? main.slice(0, colonIdx).trim() : null,
      text:  hasLabel ? main.slice(colonIdx + 1).trim() : main,
      note:  note || null,
    };
  }
  return { type: 'paragraph', text: line };
}

// ── Single section renderer ──────────────────────────────────────────────────
function Section({ header, content }) {
  const meta  = SECTION_META[header] ?? SECTION_META['INTERPRETATION'];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  return (
    <div className="flex flex-col gap-2.5">

      {/* Header row */}
      <div className="flex items-center gap-2.5">
        <span className={`text-[10px] font-bold uppercase tracking-[0.18em] shrink-0 ${meta.accent}`}>
          {header}
        </span>
        <div className={`flex-1 h-px ${meta.divider}`} />
      </div>

      {/* Callout card for NEXT DRILL / COACH'S NOTE */}
      {meta.card ? (
        <div className={`rounded-lg border px-4 py-3 ${meta.card}`}>
          <p className={`text-sm leading-relaxed ${meta.accent}`}>
            {content.trim()}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((raw, i) => {
            const p = parseLine(raw);

            /* Bullet (•) — used in SESSION SNAPSHOT */
            if (p.type === 'bullet') {
              const labelColor = SNAPSHOT_LABEL_COLORS[p.label] ?? 'text-foreground';
              return (
                <div key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className={`mt-0.5 shrink-0 text-xs ${labelColor}`}>●</span>
                  <div>
                    {p.label && (
                      <span className={`font-semibold ${labelColor}`}>{p.label}:{' '}</span>
                    )}
                    <span className="text-foreground/80">{p.text}</span>
                  </div>
                </div>
              );
            }

            /* Dash (–) — used in METRIC COMPARISON */
            if (p.type === 'dash') {
              return (
                <div key={i} className="flex flex-col gap-0.5 pl-3 border-l-2 border-border ml-0.5">
                  <div className="text-sm leading-relaxed">
                    {p.label && (
                      <span className="font-medium text-foreground">{p.label}:{' '}</span>
                    )}
                    <span className="text-muted-foreground">{p.text}</span>
                  </div>
                  {p.note && (
                    <span className="text-xs text-muted-foreground/70 italic">{p.note}</span>
                  )}
                </div>
              );
            }

            /* Paragraph — used in INTERPRETATION */
            return (
              <p key={i} className="text-sm leading-[1.7] text-muted-foreground">
                {p.text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────
export function SummaryRenderer({ text }) {
  if (!text) return null;

  const isStructured = /━━\s*.+?\s*━━/.test(text);

  if (!isStructured) {
    return <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>;
  }

  // Split into [header, content] pairs
  const headerRe   = /━━\s*(.+?)\s*━━/g;
  const parts      = text.split(/━━\s*.+?\s*━━/g);  // content between headers
  const headers    = [];
  let match;
  while ((match = headerRe.exec(text)) !== null) headers.push(match[1].trim());

  const sections = headers
    .map((header, i) => ({ header, content: (parts[i + 1] ?? '').trim() }))
    .filter(s => s.content);

  return (
    <div className="flex flex-col gap-5">
      {sections.map((s, i) => (
        <Section key={i} header={s.header} content={s.content} />
      ))}
    </div>
  );
}
