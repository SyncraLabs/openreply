"use client";

import { useState } from "react";
import type {
  Sequence,
  SequenceButton,
  SequenceStep,
  StepType,
} from "@/lib/sequence";
import { MAX_UPLOAD_BYTES, MEDIA_TYPES } from "@/lib/media";

const INPUT =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";
const SMALL_INPUT =
  "rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-accent/40 focus:outline-none";
const LINK_BUTTON = "text-xs text-muted hover:text-foreground disabled:opacity-40";

const TYPE_LABELS: Record<StepType, string> = {
  text: "Text",
  image: "Image",
  audio: "Audio",
  video: "Video",
  file: "PDF",
};

const MAX_STEPS = 10;
const MAX_BRANCHES = 10;

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newStep(): SequenceStep {
  return { id: newId(), type: "text", text: "", mediaUrl: null, delaySeconds: 60, buttons: [] };
}

type Unit = 60 | 3600 | 1;

function DelayInput({
  seconds,
  onChange,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  const [unit, setUnit] = useState<Unit>(
    seconds > 0 && seconds % 3600 === 0 ? 3600 : seconds % 60 === 0 ? 60 : 1
  );
  return (
    <span className="inline-flex items-center gap-2">
      <input
        type="number"
        min={0}
        value={seconds / unit}
        onChange={(e) =>
          onChange(
            Math.max(0, Math.min(86400, Math.round((Number(e.target.value) || 0) * unit)))
          )
        }
        className={`w-20 ${SMALL_INPUT}`}
      />
      <select
        value={unit}
        onChange={(e) => {
          const next = Number(e.target.value) as Unit;
          setUnit(next);
          onChange(Math.min(86400, Math.round((seconds / unit) * next)));
        }}
        className={SMALL_INPUT}
      >
        <option value={1}>seconds</option>
        <option value={60}>minutes</option>
        <option value={3600}>hours</option>
      </select>
    </span>
  );
}

function MediaInput({
  type,
  url,
  onChange,
}: {
  type: Exclude<StepType, "text">;
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = Object.keys(MEDIA_TYPES[type]).join(",");

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Max 4 MB per upload. For bigger files, paste a public URL.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error ?? "Upload failed");
        return;
      }
      onChange(data.data.url);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:border-border-hover ${
            uploading ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {uploading ? "Uploading..." : url ? "Replace file" : "Upload file"}
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-xs text-muted">or paste a public URL</span>
      </div>
      <input
        type="url"
        value={url ?? ""}
        onChange={(e) => onChange(e.target.value.trim() || null)}
        placeholder="https://..."
        className={INPUT}
      />
      {error && <p className="text-xs text-error">{error}</p>}
      {url && type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-40 rounded-lg border border-border" />
      )}
      {url && type === "audio" && <audio src={url} controls className="w-full" />}
      {url && type === "video" && (
        <video src={url} controls className="max-h-48 rounded-lg border border-border" />
      )}
    </div>
  );
}

function ButtonsEditor({
  buttons,
  branches,
  onChange,
}: {
  buttons: SequenceButton[];
  branches: Sequence["branches"];
  onChange: (buttons: SequenceButton[]) => void;
}) {
  const update = (i: number, button: SequenceButton) =>
    onChange(buttons.map((b, j) => (j === i ? button : b)));

  return (
    <div className="space-y-2">
      {buttons.map((button, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={button.label}
              onChange={(e) => update(i, { ...button, label: e.target.value })}
              placeholder="Button text"
              maxLength={20}
              className={`w-36 ${SMALL_INPUT}`}
            />
            <select
              value={"url" in button ? "__url" : button.branchId}
              onChange={(e) =>
                update(
                  i,
                  e.target.value === "__url"
                    ? { label: button.label, url: "" }
                    : { label: button.label, branchId: e.target.value }
                )
              }
              className={SMALL_INPUT}
            >
              <option value="__url">opens a link</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  goes to: {b.name || "unnamed branch"}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChange(buttons.filter((_, j) => j !== i))}
              className={LINK_BUTTON}
            >
              Remove
            </button>
          </div>
          {"url" in button && (
            <input
              type="url"
              value={button.url}
              onChange={(e) => update(i, { label: button.label, url: e.target.value.trim() })}
              placeholder="https://..."
              className={INPUT}
            />
          )}
        </div>
      ))}
      {buttons.length < 3 && (
        <button
          type="button"
          onClick={() => onChange([...buttons, { label: "", url: "" }])}
          className={LINK_BUTTON}
        >
          + Add button
        </button>
      )}
      {branches.length === 0 && buttons.length > 0 && (
        <p className="text-xs text-muted">
          Add a branch below to make a button jump to other messages.
        </p>
      )}
    </div>
  );
}

function StepCard({
  step,
  index,
  total,
  branches,
  firstWaitLabel,
  onChange,
  onRemove,
  onMove,
}: {
  step: SequenceStep;
  index: number;
  total: number;
  firstWaitLabel: string;
  branches: Sequence["branches"];
  onChange: (step: SequenceStep) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">Message {index + 1}</span>
          <select
            value={step.type}
            onChange={(e) => {
              const type = e.target.value as StepType;
              onChange({
                ...step,
                type,
                // Only text carries buttons; switching type drops what no longer applies.
                buttons: type === "text" ? step.buttons : [],
                mediaUrl: type === "text" ? null : step.mediaUrl,
              });
            }}
            className={SMALL_INPUT}
          >
            {(Object.keys(TYPE_LABELS) as StepType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className={LINK_BUTTON}>
            Up
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className={LINK_BUTTON}>
            Down
          </button>
          <button type="button" onClick={onRemove} className={LINK_BUTTON}>
            Remove
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Wait</span>
        <DelayInput
          seconds={step.delaySeconds}
          onChange={(delaySeconds) => onChange({ ...step, delaySeconds })}
        />
        <span className="text-xs text-muted">
          {index === 0 ? firstWaitLabel : `after message ${index}`}
        </span>
      </div>

      {step.type === "text" ? (
        <>
          <textarea
            value={step.text}
            onChange={(e) => onChange({ ...step, text: e.target.value })}
            placeholder="Write the message. {username} personalizes it."
            rows={3}
            maxLength={step.buttons.length > 0 ? 640 : 1000}
            className={`${INPUT} resize-none`}
          />
          <ButtonsEditor
            buttons={step.buttons}
            branches={branches}
            onChange={(buttons) => onChange({ ...step, buttons })}
          />
        </>
      ) : (
        <MediaInput
          type={step.type}
          url={step.mediaUrl}
          onChange={(mediaUrl) => onChange({ ...step, mediaUrl })}
        />
      )}
    </div>
  );
}

function StepList({
  steps,
  branches,
  firstWaitLabel,
  onChange,
}: {
  steps: SequenceStep[];
  branches: Sequence["branches"];
  firstWaitLabel: string;
  onChange: (steps: SequenceStep[]) => void;
}) {
  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <StepCard
          key={step.id}
          step={step}
          index={i}
          total={steps.length}
          branches={branches}
          firstWaitLabel={firstWaitLabel}
          onChange={(next) => onChange(steps.map((s, j) => (j === i ? next : s)))}
          onRemove={() => onChange(steps.filter((_, j) => j !== i))}
          onMove={(delta) => {
            const next = [...steps];
            [next[i], next[i + delta]] = [next[i + delta], next[i]];
            onChange(next);
          }}
        />
      ))}
      {steps.length < MAX_STEPS && (
        <button
          type="button"
          onClick={() => onChange([...steps, newStep()])}
          className="w-full rounded-lg border border-border py-2 text-sm text-muted hover:text-foreground"
        >
          + Add message
        </button>
      )}
    </div>
  );
}

export default function SequenceEditor({
  value,
  onChange,
}: {
  value: Sequence;
  onChange: (value: Sequence) => void;
}) {
  const setBranches = (branches: Sequence["branches"]) => onChange({ ...value, branches });

  function removeBranch(id: string) {
    // Buttons that pointed at it fall back to an empty link the form will flag.
    const unlink = (steps: SequenceStep[]) =>
      steps.map((s) => ({
        ...s,
        buttons: s.buttons.map((b) =>
          "branchId" in b && b.branchId === id ? { label: b.label, url: "" } : b
        ),
      }));
    onChange({
      main: unlink(value.main),
      branches: value.branches
        .filter((b) => b.id !== id)
        .map((b) => ({ ...b, steps: unlink(b.steps) })),
    });
  }

  return (
    <div className="space-y-4">
      <StepList
        steps={value.main}
        branches={value.branches}
        firstWaitLabel="after the link"
        onChange={(main) => onChange({ ...value, main })}
      />

      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Branches</p>
        <p className="text-xs text-muted">
          A branch is a set of messages that only goes out when someone taps a
          button pointing to it.
        </p>
        {value.branches.map((branch) => (
          <div key={branch.id} className="space-y-3 rounded-lg border border-border bg-surface/50 p-3">
            <div className="flex items-center gap-2">
              <input
                value={branch.name}
                onChange={(e) =>
                  setBranches(
                    value.branches.map((b) =>
                      b.id === branch.id ? { ...b, name: e.target.value } : b
                    )
                  )
                }
                placeholder="Branch name (e.g. Prices)"
                maxLength={40}
                className={INPUT}
              />
              <button type="button" onClick={() => removeBranch(branch.id)} className={LINK_BUTTON}>
                Delete
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={Boolean(branch.qualified)}
                onChange={(e) =>
                  setBranches(
                    value.branches.map((b) =>
                      b.id === branch.id ? { ...b, qualified: e.target.checked } : b
                    )
                  )
                }
              />
              Mark whoever taps into this branch as qualified in Contacts
            </label>
            <StepList
              steps={branch.steps}
              branches={value.branches}
              firstWaitLabel="after they tap the button"
              onChange={(steps) =>
                setBranches(
                  value.branches.map((b) => (b.id === branch.id ? { ...b, steps } : b))
                )
              }
            />
          </div>
        ))}
        {value.branches.length < MAX_BRANCHES && (
          <button
            type="button"
            onClick={() =>
              setBranches([
                ...value.branches,
                { id: newId(), name: "", qualified: false, steps: [{ ...newStep(), delaySeconds: 0 }] },
              ])
            }
            className="w-full rounded-lg border border-dashed border-border py-2 text-sm text-muted hover:text-foreground"
          >
            + Add branch
          </button>
        )}
      </div>
    </div>
  );
}
