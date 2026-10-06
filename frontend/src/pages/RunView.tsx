import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  exportUrl,
  getReplay,
  getRun,
  getScheduleSuggestion,
  getStats,
  postAnswers,
  postReview,
  proposalUrl,
  patchWbsEstimates,
  putScheduleConfig,
  replayExportUrl,
  rerunRun,
  runCaseStudies,
  saveProposal,
  similarRuns,
  streamReplay,
  streamRun,
  translateProposal,
  updateMeta,
  updateQuotation,
  type RunMeta,
  type StreamHandlers,
} from "../api";
import ArchitectureCard from "../components/ArchitectureCard";
import AttachmentsCard from "../components/AttachmentsCard";
import CaseStudiesCard from "../components/CaseStudiesCard";
import ClientOutreach from "../components/ClientOutreach";
import { DealEditor, DueBadge, StageSelect } from "../components/DealMeta";
import ExportsCard from "../components/ExportsCard";
import FeasibilityCard from "../components/FeasibilityCard";
import { IconArrowLeft, IconChevronRight, IconClock, IconMail, IconPlay, IconRefresh, IconShield } from "../components/icons";
import IntakeCard from "../components/IntakeCard";
import OverviewTab, { type TabKey } from "../components/OverviewTab";
import PatternCard from "../components/PatternCard";
import ProcessTab from "../components/ProcessTab";
import ProposalCard from "../components/ProposalCard";
import QuestionList from "../components/QuestionList";
import QuotationCard from "../components/QuotationCard";
import RequirementsCard from "../components/RequirementsCard";
import ReviewActions from "../components/ReviewActions";
import SimilarCard from "../components/SimilarCard";
import Stepper, { type StepState } from "../components/Stepper";
import { Badge, ErrorBox, Spinner, StatusPill, ThinkingCard, buttonClass } from "../components/ui";
import WBSCard from "../components/WBSCard";
import { STEP_ACTIVITY, STEP_LABELS, formatMoney } from "../labels";
import { LABELS as PII_LABELS } from "../privacyLabels";
import {
  STEPS,
  type Attachment,
  type CaseStudyMatch,
  type DealStage,
  type EffortBasis,
  type Language,
  type PricingApproval,
  type ProposalVersion,
  type Quotation,
  type ReplayInfo,
  type RunStatus,
  type ScheduleResult,
  type ScopingRun,
  type SimilarRun,
  type Stats,
  type StepName,
  type StepResults,
} from "../types";

type Results = Partial<StepResults>;
type Latency = Partial<Record<StepName, number>>;

const REVIEWABLE: RunStatus[] = ["done", "approved", "rejected"];
const TABS: { key: TabKey; label: string; steps: StepName[] }[] = [
  { key: "overview", label: "Tổng quan", steps: [] },
  { key: "input", label: "Yêu cầu & câu hỏi", steps: ["intake", "gaps"] },
  { key: "solution", label: "Giải pháp", steps: ["pattern", "feasibility", "architecture"] },
  { key: "plan", label: "Kế hoạch & báo giá", steps: ["wbs"] },
  { key: "requirements", label: "Đáp ứng yêu cầu", steps: ["requirements"] },
  { key: "proposal", label: "Proposal & hồ sơ", steps: ["proposal"] },
  { key: "process", label: "Quy trình & phê duyệt", steps: [] },
];
const TAB_OF_STEP = Object.fromEntries(TABS.flatMap((t) => t.steps.map((s) => [s, t.key]))) as Record<StepName, TabKey>;

function resultsOf(run: ScopingRun): Results {
  const results: Results = {};
  for (const step of STEPS) {
    const value = run[step];
    if (value) (results as Record<StepName, unknown>)[step] = value;
  }
  return results;
}

interface Deal {
  project_name: string | null;
  client_name: string | null;
  due_date: string | null;
  deal_stage: DealStage;
}

export default function RunView({ mode }: { mode: "run" | "replay" }) {
  const params = useParams();
  const key = (mode === "run" ? params.id : params.name) ?? "";
  const [search, setSearch] = useSearchParams();
  const tab = (TABS.some((t) => t.key === search.get("tab")) ? search.get("tab") : "overview") as TabKey;
  const setTab = useCallback(
    (next: TabKey) =>
      setSearch(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "overview") p.delete("tab");
          else p.set("tab", next);
          return p;
        },
        { replace: true },
      ),
    [setSearch],
  );

  const [results, setResults] = useState<Results>({});
  const [latency, setLatency] = useState<Latency>({});
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [runningStep, setRunningStep] = useState<StepName | null>(null);
  const [stepStartedAt, setStepStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failure, setFailure] = useState<{ step: StepName | null; message: string } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestText, setRequestText] = useState("");
  const [reviewerNote, setReviewerNote] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayInfo | null>(null);
  const [effortBasis, setEffortBasis] = useState<EffortBasis | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [deal, setDeal] = useState<Deal>({ project_name: null, client_name: null, due_date: null, deal_stage: "new" });
  const [editingDeal, setEditingDeal] = useState(false);
  const [similar, setSimilar] = useState<SimilarRun[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudyMatch[]>([]);
  const [process, setProcess] = useState<{ pricing_approval: PricingApproval | null; versions: ProposalVersion[] }>({
    pricing_approval: null,
    versions: [],
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [meta, setMeta] = useState<
    Pick<ScopingRun, "redactions" | "revision" | "feedback" | "feedback_step" | "proposal_edited" | "wbs_edited" | "translations">
  >({ redactions: {}, revision: 0, feedback: null, feedback_step: null, proposal_edited: false, wbs_edited: false, translations: {} });
  const [reloadKey, setReloadKey] = useState(0);
  const closeStream = useRef<(() => void) | null>(null);

  // Live clock for the step that is currently running.
  useEffect(() => {
    if (!runningStep) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [runningStep]);

  const applyMeta = useCallback((run: ScopingRun) => {
    setDeal({
      project_name: run.project_name ?? null,
      client_name: run.client_name ?? null,
      due_date: run.due_date ?? null,
      deal_stage: run.deal_stage ?? "new",
    });
    setQuotation(run.quotation ?? null);
    setProcess({ pricing_approval: run.pricing_approval ?? null, versions: run.versions ?? [] });
    setMeta({
      redactions: run.redactions ?? {},
      revision: run.revision ?? 0,
      feedback: run.feedback ?? null,
      feedback_step: run.feedback_step ?? null,
      proposal_edited: run.proposal_edited ?? false,
      wbs_edited: run.wbs_edited ?? false,
      translations: run.translations ?? {},
    });
  }, []);

  const applyRun = useCallback(
    (run: ScopingRun) => {
      applyMeta(run);
      setEffortBasis(run.effort_basis ?? null);
      setSchedule(run.schedule ?? null);
      setAttachments(run.attachments ?? []);
      setResults(resultsOf(run));
      setLatency(run.step_latency_ms as Latency);
      setStatus(run.status);
      setRequestText(run.request_text);
      setReviewerNote(run.reviewer_note);
      if (run.status === "failed") {
        const step = STEPS.find((s) => !run[s]) ?? null;
        setFailure({ step, message: run.error ?? "Lỗi không xác định" });
      }
    },
    [applyMeta],
  );

  const handlers: StreamHandlers = {
    onStatus: (s) => {
      setStatus(s);
      if (s === "waiting_clarification") setTab("input");
      if (s !== "running") {
        setRunningStep(null);
        // Sync fields the stream does not carry (e.g. PII counts, deal stage).
        if (mode === "run") getRun(key).then(applyMeta).catch(() => undefined);
      }
    },
    onStepStarted: (step) => {
      setRunningStep(step);
      setStepStartedAt(Date.now());
      setNow(Date.now());
    },
    onStepDone: (event) => {
      setResults((r) => ({ ...r, [event.step]: event.result }));
      if (event.step === "architecture") setEffortBasis(event.effort_basis ?? null);
      if (event.step === "wbs") {
        setSchedule(event.schedule ?? null);
        setQuotation(event.quotation ?? null);
      }
      setLatency((l) => ({ ...l, [event.step]: event.latency_ms }));
      setRunningStep(null);
    },
    onRunError: (event) => {
      setFailure({ step: event.step, message: event.message });
      setStatus("failed");
      setRunningStep(null);
    },
    onConnectionError: (message) => {
      setConnectionError(message);
      setRunningStep(null);
    },
  };

  const startStream = (segment = 0) => {
    closeStream.current?.();
    setConnectionError(null);
    setFailure(null);
    closeStream.current = mode === "run" ? streamRun(key, handlers) : streamReplay(key, segment, handlers);
  };

  useEffect(() => {
    let cancelled = false;
    setResults({});
    setLatency({});
    setStatus(null);
    setRunningStep(null);
    setFailure(null);
    setConnectionError(null);
    setLoadError(null);

    const load = async () => {
      try {
        if (mode === "run") {
          const run = await getRun(key);
          if (cancelled) return;
          applyRun(run);
          // Finished runs are shown from storage; only unfinished ones open the stream.
          if (run.status === "created") startStream();
        } else {
          const info = await getReplay(key);
          if (cancelled) return;
          setReplay(info);
          setAttachments(info.attachments ?? []);
          setRequestText(info.request_text);
          startStream(0);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Không tải được dữ liệu.");
      }
    };
    load();
    return () => {
      cancelled = true;
      closeStream.current?.();
      closeStream.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, key, reloadKey, applyRun]);

  useEffect(() => {
    if (mode !== "run" || !results.pattern) return;
    similarRuns(key).then(setSimilar).catch(() => setSimilar([]));
    runCaseStudies(key).then(setCaseStudies).catch(() => setCaseStudies([]));
  }, [mode, key, results.pattern]);

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  const saveMeta = async (metaBody: RunMeta) => {
    applyMeta(await updateMeta(key, metaBody));
    setEditingDeal(false);
  };

  const changeQuotation = async (body: Parameters<typeof updateQuotation>[1]) => {
    applyMeta(await updateQuotation(key, body));
  };

  const editWbs = async (estimates: Record<string, number>) => {
    applyRun(await patchWbsEstimates(key, estimates));
  };

  const changeSchedule = async (config: Parameters<typeof putScheduleConfig>[1]) => {
    const run = await putScheduleConfig(key, config);
    setSchedule(run.schedule ?? null);
    applyMeta(run); // the quotation follows the new timeline
  };

  const submitAnswers = async (answers: Record<string, string>) => {
    const filled = Object.fromEntries(Object.entries(answers).filter(([, value]) => value.trim().length > 0));
    if (mode === "run") {
      const run = await postAnswers(key, filled);
      applyRun(run);
      startStream();
    } else {
      setResults(({ gaps: _gaps, ...rest }) => rest);
      setStatus("created");
      startStream(1);
    }
  };

  const rerun = async (fromStep: StepName, feedback: string) => {
    const run = await rerunRun(key, fromStep, feedback);
    applyRun(run);
    setTab("overview");
    startStream();
  };

  const saveEdit = async (markdown: string, title: string | null) => {
    applyRun(await saveProposal(key, markdown, title));
  };

  const translate = async (language: Language) => {
    const { markdown } = await translateProposal(key, language);
    setMeta((m) => ({ ...m, translations: { ...m.translations, [language]: markdown } }));
  };

  const review = async (approved: boolean, note: string | null) => {
    if (mode === "run") {
      const run = await postReview(key, approved, note);
      setStatus(run.status);
      setReviewerNote(run.reviewer_note);
      applyMeta(run);
    } else {
      setStatus(approved ? "approved" : "rejected");
      setReviewerNote(note);
    }
  };

  const openStep = (step: StepName) => {
    setTab(TAB_OF_STEP[step]);
    setTimeout(() => document.getElementById(`step-${step}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const stateOf = (step: StepName): StepState => {
    if (results[step]) return "done";
    if (failure?.step === step) return "error";
    if (runningStep === step) return "running";
    return "pending";
  };
  const states = Object.fromEntries(STEPS.map((s) => [s, stateOf(s)])) as Record<StepName, StepState>;
  const liveMs = runningStep && stepStartedAt ? Math.max(0, now - stepStartedAt) : 0;
  const totalMs = Object.values(latency).reduce((sum, ms) => sum + (ms ?? 0), 0) + liveMs;
  const waiting = status === "waiting_clarification";
  const canAnswer = mode === "run" || (replay?.segments.length ?? 0) > 1;
  const reviewable = status !== null && REVIEWABLE.includes(status);
  const language = results.intake?.language ?? "vi";
  const wbsLock =
    mode === "replay"
      ? "Đây là bản Replay (phát lại demo) nên chỉ xem được, không sửa. Để sửa man-day, mở một hồ sơ trong mục Hồ sơ hoặc tạo hồ sơ mới."
      : status === "approved"
      ? "Hồ sơ đã duyệt kỹ thuật: bấm Yêu cầu sửa nếu cần chỉnh WBS."
      : process.pricing_approval?.approved
        ? "Giá đã được duyệt nên WBS đang khóa: hủy duyệt giá ở tab Quy trình & phê duyệt để sửa."
        : status === "done" || status === "rejected"
          ? null
          : "Chỉ sửa được khi hồ sơ đã phân tích xong.";
  const zipUrl = results.proposal
    ? mode === "run"
      ? exportUrl(key, "package.zip", language)
      : replay?.has_final_run
        ? replayExportUrl(key, "package.zip", language)
        : undefined
    : undefined;
  const title = deal.project_name || results.intake?.business_goal || (mode === "replay" ? `Replay ${key}` : `Hồ sơ #${key}`);
  const hoursSaved = stats && results.proposal ? Math.max(0, stats.manual_hours_per_proposal - stats.review_hours_per_proposal - totalMs / 3_600_000) : null;

  if (loadError) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <ErrorBox>{loadError}</ErrorBox>
        <Link to="/history" className={`${buttonClass.secondary} mt-4`}>
          <IconArrowLeft />
          Về danh sách hồ sơ
        </Link>
      </main>
    );
  }

  const running = runningStep && (
    <ThinkingCard step={runningStep} label={STEP_LABELS[runningStep]} activity={STEP_ACTIVITY[runningStep]} elapsedMs={liveMs} />
  );
  const tabCount = (key: TabKey): number | null => {
    if (key === "input") return results.gaps?.questions.length ?? null;
    if (key === "requirements") return results.requirements && !results.requirements.skipped ? results.requirements.items.length : null;
    return null;
  };
  const tabReady = (t: (typeof TABS)[number]) =>
    t.key === "overview" ||
    t.steps.some((s) => results[s]) ||
    (t.key === "input" && attachments.length > 0) ||
    (t.key === "process" && mode === "run" && Boolean(results.intake));
  const latestVersion = process.versions.at(-1);

  return (
    <div>
      {/* Case header */}
      <header className="border-b border-line bg-surface px-6 pt-4">
        <nav className="mb-1 flex items-center gap-1 text-sm text-subtle" aria-label="Breadcrumb">
          <Link to="/history" className="hover:text-fg">
            Hồ sơ
          </Link>
          <IconChevronRight />
          <span className="font-mono">{mode === "replay" ? `replay/${key}` : `#${key}`}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingDeal && mode === "run" ? (
              <DealEditor initial={deal} onSave={saveMeta} onCancel={() => setEditingDeal(false)} />
            ) : (
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-fg">
                <span className="min-w-0">{title}</span>
                {mode === "run" && (
                  <button type="button" onClick={() => setEditingDeal(true)} className="text-sm font-normal text-subtle hover:text-fg">
                    Sửa
                  </button>
                )}
              </h1>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{deal.client_name || <span className="text-subtle">Chưa có tên khách</span>}</span>
              <DueBadge due={deal.due_date} />
              <StageSelect stage={deal.deal_stage} onChange={mode === "run" ? (s) => saveMeta({ deal_stage: s }) : undefined} />
              {status && <StatusPill status={status} />}
              {meta.revision > 0 && <Badge tone="info">Bản sửa #{meta.revision}</Badge>}
              {mode === "run" && reviewable && (
                <button type="button" onClick={() => setTab("process")} className="inline-flex items-center gap-1.5" title="Phê duyệt 2 cấp">
                  <Badge tone={status === "approved" ? "success" : "neutral"}>KT {status === "approved" ? "✓" : "–"}</Badge>
                  {quotation && (
                    <Badge tone={process.pricing_approval?.approved ? "success" : process.pricing_approval ? "warning" : "neutral"}>
                      Giá {process.pricing_approval?.approved ? "✓" : process.pricing_approval ? "✗" : "–"}
                    </Badge>
                  )}
                </button>
              )}
              {latestVersion && (
                <Badge tone={latestVersion.sent ? "success" : "info"}>
                  v{latestVersion.version}
                  {latestVersion.sent ? " · đã gửi" : ""}
                </Badge>
              )}
              {Object.keys(meta.redactions).length > 0 && (
                <Badge tone="success">
                  <IconShield />
                  Đã ẩn {Object.entries(meta.redactions).map(([kind, n]) => `${n} ${PII_LABELS[kind] ?? kind}`).join(", ")} trước khi gửi LLM
                </Badge>
              )}
              {mode === "replay" && (
                <Badge tone="warning">
                  <IconPlay />
                  Replay{replay?.llm_provider ? ` · ghi từ ${replay.llm_provider}` : ""}
                </Badge>
              )}
              <span className="inline-flex items-center gap-1 text-subtle tabular-nums">
                <IconClock /> {(totalMs / 1000).toFixed(1)}s
              </span>
              {quotation && <span className="font-medium text-fg tabular-nums">{formatMoney(quotation.total, quotation.currency)}</span>}
              {hoursSaved !== null && <span className="text-success">Tiết kiệm ≈ {hoursSaved.toFixed(1)} giờ</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReviewActions
              status={status}
              reviewerNote={reviewerNote}
              downloadHref={zipUrl}
              onReview={review}
              onRerun={mode === "run" ? rerun : undefined}
            />
          </div>
        </div>
        {meta.feedback && meta.feedback_step && (
          <p className="mt-2 rounded-md bg-info-soft px-3 py-1.5 text-sm text-fg">
            <b className="text-info">Góp ý của AI dev</b> (chạy lại từ bước {STEP_LABELS[meta.feedback_step]}): {meta.feedback}
          </p>
        )}
        <div className="mt-3 border-t border-line py-2">
          <Stepper states={states} latency={latency} liveMs={liveMs} onSelect={openStep} />
        </div>
        <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist" aria-label="Nội dung hồ sơ">
          {TABS.map((t) => {
            const count = tabCount(t.key);
            const ready = tabReady(t);
            const attention = t.key === "input" && waiting;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                disabled={!ready}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  tab === t.key ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {t.label}
                {count !== null && <span className="rounded bg-surface-2 px-1.5 text-xs text-subtle tabular-nums">{count}</span>}
                {attention && <span className="h-2 w-2 rounded-full bg-warning" aria-label="Cần xử lý" />}
                {t.steps.some((s) => runningStep === s) && <Spinner className="h-3 w-3 text-accent" />}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-[1180px] space-y-4 px-6 py-5">
        {status === null && (
          <p className="flex items-center gap-2 text-muted">
            <Spinner /> Đang tải…
          </p>
        )}
        {status === "running" && !runningStep && !closeStream.current && (
          <ErrorBox>
            Hồ sơ này đang được xử lý ở một cửa sổ khác.{" "}
            <button type="button" className="font-semibold underline" onClick={() => setReloadKey((k) => k + 1)}>
              Tải lại
            </button>
          </ErrorBox>
        )}
        {failure && (
          <ErrorBox>
            <p className="font-semibold">Bước {failure.step ? STEP_LABELS[failure.step] : ""} thất bại</p>
            <p className="mt-0.5">{failure.message}</p>
            {mode === "run" && (
              <button type="button" className={`${buttonClass.secondary} mt-2`} onClick={() => startStream()}>
                <IconRefresh />
                Chạy lại từ bước lỗi
              </button>
            )}
          </ErrorBox>
        )}
        {connectionError && (
          <ErrorBox>
            <p>{connectionError}</p>
            <button type="button" className={`${buttonClass.secondary} mt-2`} onClick={() => setReloadKey((k) => k + 1)}>
              <IconRefresh />
              Kết nối lại
            </button>
          </ErrorBox>
        )}

        {tab === "overview" && (
          <>
            {running}
            <OverviewTab results={results} quotation={quotation} schedule={schedule} waiting={waiting} onOpen={setTab} />
            {requestText && (
              <details className="rounded-lg border border-line bg-surface">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-medium text-fg">
                  <IconMail className="text-subtle" />
                  Yêu cầu gốc của khách
                </summary>
                <p className="border-t border-line px-4 py-3 whitespace-pre-wrap text-muted">{requestText}</p>
              </details>
            )}
            {mode === "run" && similar.length > 0 && <SimilarCard items={similar} />}
          </>
        )}

        {tab === "input" && (
          <>
            {attachments.length > 0 && <AttachmentsCard attachments={attachments} />}
            {results.intake && <IntakeCard data={results.intake} />}
            {results.gaps && (
              <QuestionList
                key={`${waiting}-${replay?.name ?? ""}`}
                data={results.gaps}
                waiting={waiting && canAnswer}
                initialAnswers={replay?.segments[1]?.answers ?? {}}
                onSubmit={submitAnswers}
                extra={
                  mode === "run" && results.gaps.questions.length > 0 ? (
                    <ClientOutreach
                      runId={key}
                      waiting={waiting}
                      onImported={(run) => {
                        applyRun(run);
                        startStream();
                      }}
                    />
                  ) : undefined
                }
              />
            )}
            {runningStep && TAB_OF_STEP[runningStep] === "input" && running}
          </>
        )}

        {tab === "solution" && (
          <>
            {results.pattern && <PatternCard data={results.pattern} />}
            {results.feasibility && <FeasibilityCard data={results.feasibility} />}
            {results.architecture && <ArchitectureCard data={results.architecture} basis={effortBasis} />}
            {runningStep && TAB_OF_STEP[runningStep] === "solution" && running}
          </>
        )}

        {tab === "plan" && (
          <>
            {quotation && (
              <QuotationCard
                data={quotation}
                approval={process.pricing_approval}
                onChange={mode === "run" && status !== "running" ? changeQuotation : undefined}
              />
            )}
            {results.wbs && (
              <WBSCard
                data={results.wbs}
                schedule={schedule}
                downloadHref={mode === "run" ? exportUrl(key, "bidding.xlsx") : replay?.has_final_run ? replayExportUrl(key, "bidding.xlsx") : undefined}
                onScheduleChange={mode === "run" && status !== "running" ? changeSchedule : undefined}
                onScheduleSuggest={mode === "run" ? () => getScheduleSuggestion(key) : undefined}
                edited={meta.wbs_edited}
                onEstimatesSave={mode === "run" && wbsLock === null ? editWbs : undefined}
                lockReason={wbsLock}
              />
            )}
            {runningStep === "wbs" && running}
          </>
        )}

        {tab === "requirements" && (
          <>
            {results.requirements && <RequirementsCard data={results.requirements} requirements={attachments.flatMap((a) => a.requirements)} />}
            {runningStep === "requirements" && running}
          </>
        )}

        {tab === "proposal" && (
          <>
            {results.proposal && reviewable && (mode === "run" || replay?.has_final_run) && (
              <ExportsCard
                urlFor={(name, lang) => (mode === "run" ? exportUrl(key, name, lang) : replayExportUrl(key, name, lang))}
                customerLanguage={language}
                markdownUrl={mode === "run" ? proposalUrl(key) : undefined}
                hasQuestions={(results.gaps?.questions.length ?? 0) > 0}
              />
            )}
            {results.proposal && (
              <ProposalCard
                data={results.proposal}
                filename={`proposal_${key}.md`}
                approved={status === "approved"}
                reviewerNote={reviewerNote}
                edited={meta.proposal_edited}
                translations={meta.translations}
                canEdit={mode === "run" && (status === "done" || status === "rejected")}
                onSave={mode === "run" ? saveEdit : undefined}
                onTranslate={mode === "run" ? translate : undefined}
              />
            )}
            {mode === "run" && caseStudies.length > 0 && <CaseStudiesCard items={caseStudies} />}
            {runningStep === "proposal" && running}
          </>
        )}

        {tab === "process" && mode === "run" && (
          <ProcessTab
            runId={key}
            status={status}
            reviewerNote={reviewerNote}
            quotation={quotation}
            approval={process.pricing_approval}
            versions={process.versions}
            hasProposal={Boolean(results.proposal)}
            refreshKey={`${status}-${Object.keys(results).length}`}
            onRun={applyMeta}
            onReload={() => getRun(key).then(applyMeta).catch(() => undefined)}
          />
        )}
      </main>
    </div>
  );
}
