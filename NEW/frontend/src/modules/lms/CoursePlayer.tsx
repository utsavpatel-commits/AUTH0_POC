import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, FileText, Check, PenLine, ShieldCheck, Clock, CheckCircle2, Award,
  Trophy, Sparkles, Star, GraduationCap, ScrollText, PlayCircle, Youtube,
} from 'lucide-react';
import { api, apiUrl } from '../../lib/api';
import { Button, Badge } from '../../components/ui';
import { burstConfetti } from '../../lib/confetti';

interface Game { points: number; level: number; level_name: string; }
interface Curriculum { key: string; name: string; status: string; }
interface CurriculaResp { curricula: Curriculum[]; }
interface Material { id: number; kind: string; file_name: string; file_format: string; url: string | null; version: number; is_active: boolean }

export interface PlayerCourse {
  id: number;
  course_id?: number;
  course_title: string;
  duration_hours: number;
  training_type: string;
  source: string;
  status: string;
}

function ytId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(url) ? url : null);
}

type Step = 'review' | 'acknowledge' | 'sign' | 'done';

const sourceLabel = (s: string) =>
  s === 'policy_ack' ? 'Policy update' : s === 'poc' ? 'Plan of Correction' : s === 'mock_survey' ? 'Mock Survey' : null;

// Lightweight demo content per course (keyword-matched). Real system streams the PDF/SCORM.
function bodyFor(title: string): { summary: string; points: string[] } {
  const t = title.toLowerCase();
  if (t.includes('wound') || t.includes('skin'))
    return { summary: 'This module covers prevention, staging, and treatment of pressure injuries in long-term care, aligned to CMS F-686.',
      points: ['Reposition at-risk residents every 2 hours and document.', 'Stage wounds accurately and reassess weekly.', 'Escalate non-healing wounds to the wound nurse within 24h.', 'Maintain the care plan and treatment record together.'] };
  if (t.includes('infection') || t.includes('hygiene') || t.includes('ppe'))
    return { summary: 'Core infection prevention practices: hand hygiene, PPE selection, and transmission-based precautions per CMS F-880.',
      points: ['Perform hand hygiene before and after every resident contact.', 'Select PPE based on the precaution type.', 'Report suspected outbreaks to the IP immediately.', 'Document surveillance daily.'] };
  if (t.includes('medication') || t.includes('med '))
    return { summary: 'Safe medication administration: the rights of administration, documentation, and error reporting.',
      points: ['Verify the resident, drug, dose, route, and time.', 'Never leave medications unattended.', 'Document immediately after administration.', 'Report errors without delay — no blame culture.'] };
  if (t.includes('hipaa') || t.includes('privacy'))
    return { summary: 'Protecting resident health information under HIPAA — minimum necessary, secure handling, and breach reporting.',
      points: ['Share PHI only on a need-to-know basis.', 'Never share login credentials.', 'Secure paper and screens from view.', 'Report any suspected breach within the hour.'] };
  if (t.includes('rights') || t.includes('dignity') || t.includes('abuse'))
    return { summary: 'Resident rights, dignity, and the facility’s zero-tolerance abuse prohibition policy.',
      points: ['Treat every resident with dignity and respect.', 'Recognize and immediately report signs of abuse or neglect.', 'Honor resident choice and privacy.', 'Know the grievance process.'] };
  return { summary: `This training covers the key requirements and best practices for ${title}. Review the material, acknowledge your understanding, and sign to record completion.`,
    points: ['Understand the regulation and why it matters.', 'Apply the facility’s policy in daily practice.', 'Document accurately and on time.', 'Escalate concerns through the right channel.'] };
}

export function CoursePlayer({
  course, userId, userName, onClose,
}: {
  course: PlayerCourse; userId: number; userName: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('review');
  const [ack, setAck] = useState(false);
  const [sig, setSig] = useState('');
  const [reward, setReward] = useState<{ earned: number; leveledUp: boolean; levelName: string; programDone: { key: string; name: string } | null }>({ earned: 100, leveledUp: false, levelName: '', programDone: null });
  const content = bodyFor(course.course_title);

  // the active training material for this course (document or YouTube video)
  const materials = useQuery({
    queryKey: ['course-materials', course.course_id],
    queryFn: () => api<Material[]>(`/api/lms/courses/${course.course_id}/materials`),
    enabled: course.course_id != null,
  });
  const activeMat = (materials.data ?? []).find((m) => m.is_active) ?? (materials.data ?? [])[0];
  const videoId = activeMat?.kind === 'video' ? ytId(activeMat.url) : null;

  const complete = useMutation({
    mutationFn: async () => {
      const before = await api<Game>(`/api/lms/gamification?user_id=${userId}`).catch(() => null);
      const curBefore = await api<CurriculaResp>(`/api/lms/curricula?user_id=${userId}`).catch(() => null);
      await api(`/api/lms/assignments/${course.id}?status=completed`, { method: 'PATCH' });
      const after = await api<Game>(`/api/lms/gamification?user_id=${userId}`).catch(() => null);
      const curAfter = await api<CurriculaResp>(`/api/lms/curricula?user_id=${userId}`).catch(() => null);
      return { before, after, curBefore, curAfter };
    },
    onSuccess: ({ before, after, curBefore, curAfter }) => {
      const earned = before && after ? after.points - before.points : 100;
      const leveledUp = !!(before && after && after.level > before.level);
      // a curriculum that was NOT complete before but IS now
      let programDone: { key: string; name: string } | null = null;
      if (curBefore && curAfter) {
        const wasComplete = new Set(curBefore.curricula.filter((c) => c.status === 'complete').map((c) => c.key));
        const nowComplete = curAfter.curricula.find((c) => c.status === 'complete' && !wasComplete.has(c.key));
        if (nowComplete) programDone = { key: nowComplete.key, name: nowComplete.name };
      }
      setReward({ earned: earned > 0 ? earned : 100, leveledUp, levelName: after?.level_name ?? '', programDone });
      qc.invalidateQueries({ queryKey: ['my-training'] });
      qc.invalidateQueries({ queryKey: ['gamification'] });
      qc.invalidateQueries({ queryKey: ['curricula'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      qc.invalidateQueries({ queryKey: ['lms-stats'] });
      setStep('done');
      burstConfetti(programDone ? 3200 : leveledUp ? 2600 : 1800);
    },
  });

  const steps: { key: Step; label: string; icon: typeof FileText }[] = [
    { key: 'review', label: 'Review', icon: FileText },
    { key: 'acknowledge', label: 'Acknowledge', icon: Check },
    { key: 'sign', label: 'Sign', icon: PenLine },
  ];
  const stepIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onClose} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={15} /> Back to My Learning
      </button>

      {/* header */}
      <div className="rounded-t-2xl bg-navy-gradient text-white p-6">
        <div className="flex items-center gap-2 text-xs text-brand-200 font-medium">
          {sourceLabel(course.source) && <Badge tone="amber">{sourceLabel(course.source)}</Badge>}
          <span className="inline-flex items-center gap-1"><Clock size={12} /> {course.duration_hours}h</span>
          <span className="capitalize">· {course.training_type.replace(/_/g, ' ')}</span>
        </div>
        <h1 className="text-2xl font-bold mt-1">{course.course_title}</h1>
      </div>

      {/* stepper */}
      {step !== 'done' && (
        <div className="bg-white border-x border-slate-200 px-6 py-3 flex items-center gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const active = i === stepIdx, complete_ = i < stepIdx;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${complete_ ? 'bg-accent-emerald text-white' : active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {complete_ ? <Check size={14} /> : <Icon size={14} />}
                </div>
                <span className={`text-sm ${active ? 'text-navy-800 font-semibold' : 'text-slate-400'}`}>{s.label}</span>
                {i < steps.length - 1 && <span className="w-8 h-px bg-slate-200 mx-1" />}
              </div>
            );
          })}
        </div>
      )}

      {/* body */}
      <div className="bg-white border border-slate-200 rounded-b-2xl border-t-0 p-6 min-h-[360px]">
        {step === 'review' && (
          <div>
            {videoId ? (
              /* ---- YouTube video training material ---- */
              <div>
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-3">
                  <Youtube size={15} className="text-rose-500" /> {activeMat?.file_name || 'Training video'} · video {activeMat?.version ? `v${activeMat.version}` : ''}
                </div>
                <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-black" style={{ paddingTop: '56.25%' }}>
                  <iframe
                    className="absolute inset-0 h-full w-full"
                    src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
                    title={activeMat?.file_name || course.course_title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">Watch the full video, then acknowledge below.</p>
              </div>
            ) : activeMat && course.course_id != null ? (
              /* ---- actual PDF document ---- */
              <div>
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-3">
                  <FileText size={14} /> {activeMat.file_name} · document {activeMat.version ? `v${activeMat.version}` : ''}
                </div>
                <iframe
                  src={`${apiUrl(`/api/lms/materials/${activeMat.id}/file`)}#toolbar=0&navpanes=0&view=FitH`}
                  title={activeMat.file_name || course.course_title}
                  className="w-full rounded-xl border border-slate-200 bg-slate-100"
                  style={{ height: 560 }}
                />
                <p className="text-xs text-slate-400 mt-2">
                  Review the full document, then acknowledge below.
                  {' '}<a href={apiUrl(`/api/lms/materials/${activeMat.id}/file`)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Open in a new tab ↗</a>
                </p>
              </div>
            ) : (
              /* ---- fallback simulated viewer (no material on file) ---- */
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-4">
                  <FileText size={14} /> {`${course.course_title.replace(/\s+/g, '_')}.pdf`} · page 1 of 1
                </div>
                <p className="text-slate-700 leading-relaxed">{content.summary}</p>
                <ul className="mt-4 space-y-2">
                  {content.points.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-0.5 h-5 w-5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end mt-5">
              <Button size="lg" onClick={() => setStep('acknowledge')}>
                {videoId ? <><PlayCircle size={16} /> I’ve watched this →</> : 'I’ve reviewed this →'}
              </Button>
            </div>
          </div>
        )}

        {step === 'acknowledge' && (
          <div>
            <div className="flex items-start gap-3 rounded-xl bg-brand-50 border border-brand-100 p-4">
              <ShieldCheck className="text-brand-600 shrink-0" size={20} />
              <p className="text-sm text-brand-900">
                Acknowledging confirms you have read and understood <strong>{course.course_title}</strong> and
                agree to follow the facility’s policy in your daily practice.
              </p>
            </div>
            <label className="flex items-start gap-3 mt-5 cursor-pointer">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
              <span className="text-sm text-slate-700">
                I, <strong>{userName}</strong>, acknowledge that I have read and understood this training material.
              </span>
            </label>
            <div className="flex justify-between mt-6">
              <Button variant="ghost" onClick={() => setStep('review')}>Back</Button>
              <Button size="lg" disabled={!ack} onClick={() => setStep('sign')}>Continue to sign →</Button>
            </div>
          </div>
        )}

        {step === 'sign' && (
          <div>
            <div className="text-sm text-slate-600 mb-3">
              Type your full name to sign. This electronic signature is recorded with a timestamp as your
              completion record.
            </div>
            <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Electronic signature</label>
            <input value={sig} onChange={(e) => setSig(e.target.value)} placeholder={userName}
              className="w-full rounded-lg border border-slate-300 px-3 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
              style={{ fontFamily: '"Brush Script MT", cursive' }} />
            <div className="text-xs text-slate-400 mt-1.5">Must match: {userName}</div>
            <div className="flex justify-between mt-6">
              <Button variant="ghost" onClick={() => setStep('acknowledge')}>Back</Button>
              <Button size="lg"
                disabled={sig.trim().toLowerCase() !== userName.toLowerCase() || complete.isPending}
                onClick={() => complete.mutate()}>
                <PenLine size={16} /> Sign & complete
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-8">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-50 ring-2 ring-emerald-100 flex items-center justify-center animate-[pop_.4s_ease]">
              <CheckCircle2 size={34} className="text-accent-emerald" />
            </div>
            <h2 className="text-xl font-bold text-navy-800 mt-4">Training complete!</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {course.course_title} is recorded with your signature.
            </p>

            {/* points earned */}
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-brand-50 ring-1 ring-brand-200 px-4 py-2">
              <Sparkles size={16} className="text-brand-600" />
              <span className="text-sm font-bold text-brand-700">+{reward.earned} points earned</span>
            </div>

            {/* program complete — the big moment */}
            {reward.programDone && (
              <div className="mx-auto mt-4 max-w-sm rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-5 animate-[pop_.45s_ease]">
                <div className="flex items-center justify-center gap-2">
                  <GraduationCap size={22} className="text-white" />
                  <span className="font-bold text-lg">Program complete!</span>
                </div>
                <div className="text-sm text-white/90 mt-1.5">
                  You finished every course in <strong className="text-white">{reward.programDone.name}</strong>.
                  Your consolidated certificate is ready.
                </div>
                <a
                  href={`/api/lms/curricula/${reward.programDone.key}/certificate.pdf?user_id=${userId}`}
                  target="_blank" rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white text-emerald-700 text-sm font-semibold px-4 py-2 hover:bg-emerald-50"
                >
                  <ScrollText size={15} /> Get consolidated certificate
                </a>
              </div>
            )}

            {/* level up */}
            {reward.leveledUp && (
              <div className="mx-auto mt-4 max-w-xs rounded-xl bg-navy-gradient text-white p-4">
                <div className="flex items-center justify-center gap-2">
                  <Trophy size={18} className="text-amber-300" />
                  <span className="font-bold">Level up!</span>
                </div>
                <div className="text-sm text-white/80 mt-1">
                  You reached <strong className="text-white">{reward.levelName}</strong>
                </div>
                <div className="flex justify-center gap-1 mt-2">
                  {[0, 1, 2].map((i) => <Star key={i} size={14} className="text-amber-300 fill-amber-300" />)}
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 mt-6">
              <a href={`/api/lms/assignments/${course.id}/certificate.pdf`} target="_blank" rel="noreferrer">
                <Button variant="outline"><Award size={15} /> View certificate</Button>
              </a>
              <Button onClick={onClose}>Back to My Learning</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
