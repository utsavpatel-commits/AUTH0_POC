import { Clock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { courseIcon, dueChip, sourceLabel, type MyCourse } from '../courseMeta';

/** Calm, Apple-like 'do this next' mode: one immersive hero + a slim up-next rail. */
export function FocusView({
  todo, completedCount, total, onOpen,
}: {
  todo: MyCourse[]; completedCount: number; total: number; onOpen: (c: MyCourse) => void;
}) {
  const ordered = [...todo].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const hero = ordered[0];
  const rest = ordered.slice(1);
  const weekDone = completedCount;

  if (!hero) {
    return (
      <div className="rounded-3xl text-white p-12 text-center" style={{ background: 'linear-gradient(135deg, #0f9d6c 0%, #00a0d7 100%)' }}>
        <CheckCircle2 size={48} className="mx-auto text-white" />
        <h2 className="text-2xl font-bold mt-4">All caught up</h2>
        <p className="text-white/80 mt-1">Every assigned training is complete. Nice work.</p>
      </div>
    );
  }

  const ic = courseIcon(hero.course_title);
  const Icon = ic.icon;
  const chip = dueChip(hero);

  return (
    <div className="space-y-5">
      {/* immersive hero — vivid brand gradient tinted by the course accent */}
      <div
        className="relative isolate rounded-3xl overflow-hidden text-white p-10 min-h-[340px] flex flex-col justify-between"
        style={{ background: `linear-gradient(135deg, #006f97 0%, #00a0d7 48%, ${ic.hex} 130%)` }}
      >
        <div className="relative z-10">
          <div className={`text-xs font-bold uppercase tracking-widest ${chip.cls.includes('rose') ? 'text-rose-100' : 'text-white/80'}`}>
            {chip.text}{sourceLabel(hero.source) ? ` · ${sourceLabel(hero.source)}` : ''}
          </div>
          <h1 className="text-4xl font-bold mt-3 max-w-xl leading-tight">{hero.course_title}</h1>
          <div className="flex items-center gap-4 mt-4 text-white/70 text-sm">
            <span className="inline-flex items-center gap-1.5"><Clock size={15} /> {hero.duration_hours}h</span>
            <span className="capitalize">{hero.training_type.replace(/_/g, ' ')}</span>
            <span>· keeps you survey-ready</span>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between mt-8">
          <button
            onClick={() => onOpen(hero)}
            className="inline-flex items-center gap-2 rounded-xl bg-white text-navy-800 font-semibold px-6 py-3 shadow-lg hover:bg-brand-50 transition-colors"
          >
            {hero.status === 'in_progress' ? 'Resume' : 'Start now'} <ArrowRight size={18} />
          </button>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              {Array.from({ length: total }).map((_, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < weekDone ? 'bg-emerald-300' : 'bg-white/25'}`} />
              ))}
            </div>
            <div className="text-xs text-white/60 mt-1.5">{weekDone} of {total} complete</div>
          </div>
        </div>

        {/* giant ghost icon + light bloom */}
        <Icon className="absolute -right-6 -bottom-10 text-white/15" size={260} />
        <div className="absolute -left-10 -top-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute right-1/3 top-0 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      </div>

      {/* up next rail */}
      {rest.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Up next</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {rest.map((c) => {
              const cic = courseIcon(c.course_title);
              const CIcon = cic.icon;
              const cchip = dueChip(c);
              return (
                <button key={c.id} onClick={() => onOpen(c)}
                  className="shrink-0 w-52 text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-brand-200 hover:shadow-md transition-all">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${cic.bg}`}>
                    <CIcon size={17} className={cic.fg} />
                  </div>
                  <div className="font-medium text-navy-800 text-sm mt-2 leading-tight line-clamp-2">{c.course_title}</div>
                  <div className={`text-[11px] mt-1 ${cchip.cls}`}>{cchip.text}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
