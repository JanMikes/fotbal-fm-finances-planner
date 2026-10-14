"use client";
/**
 * „Přílohy a odkazy" box of the task / print modal (prototype §8.4).
 * The prototype edits attachments on a working copy and applies them on Save; the API needs an existing parent, so
 * the modal keeps a draft (pending files / links / removed ids) and calls `applyAttachmentDraft` after saving the item.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { fmtSize, normalizeUrl } from "@/lib/format";
import type { Actions } from "@/lib/store/actions";
import type { Attachment, ParentKind } from "@/lib/types";

export interface PendingFile {
  key: string;
  file: File;
  /** blob: URL for the immediate download link */
  url: string;
}
export interface PendingLink {
  key: string;
  url: string;
  label: string;
}
export interface AttachmentDraft {
  removed: ReadonlySet<string>;
  files: readonly PendingFile[];
  links: readonly PendingLink[];
}

export const emptyDraft = (): AttachmentDraft => ({ removed: new Set(), files: [], links: [] });

let seq = 0;
const key = () => `p${++seq}`;

/** Inline styles copied verbatim from the prototype markup (`#lUrl`, `#lLabel`). */
const LINK_INPUT_STYLE: CSSProperties = { border: "1px solid var(--grey-300)", borderRadius: 3, padding: "0 12px", fontSize: 15 };

export function AttachmentBox({
  existing,
  draft,
  onChange,
}: {
  existing: readonly Attachment[];
  draft: AttachmentDraft;
  onChange: (d: AttachmentDraft) => void;
}) {
  const [over, setOver] = useState(false);
  const urlRef = useRef<HTMLInputElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  // revoke blob URLs on unmount
  useEffect(
    () => () => {
      for (const f of draftRef.current.files) URL.revokeObjectURL(f.url);
    },
    [],
  );

  const kept = existing.filter((a) => !draft.removed.has(a.id));
  const files = kept.filter((a) => a.kind === "file");
  const links = kept.filter((a) => a.kind === "link");

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const added: PendingFile[] = [];
    const tooBig: string[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_UPLOAD_BYTES) tooBig.push(file.name);
      else added.push({ key: key(), file, url: URL.createObjectURL(file) });
    }
    if (tooBig.length) window.alert(`Soubor je příliš velký (max. 25 MB): ${tooBig.join(", ")}`);
    if (added.length) onChange({ ...draft, files: [...draft.files, ...added] });
  };

  const addLink = () => {
    const u = normalizeUrl(urlRef.current?.value ?? "");
    if (!u) return;
    onChange({ ...draft, links: [...draft.links, { key: key(), url: u, label: (labelRef.current?.value ?? "").trim() }] });
    if (urlRef.current) urlRef.current.value = "";
    if (labelRef.current) labelRef.current.value = "";
  };

  const remove = (id: string) => onChange({ ...draft, removed: new Set([...draft.removed, id]) });

  return (
    <div className="attbox">
      <div className="items" id="items">
        {files.map((a) => (
          <div className="item" key={a.id}>
            <span className="ty">Soubor</span>
            <a href={a.url} download={a.name}>
              {a.name}
            </a>
            <span className="sz">{fmtSize(a.sizeBytes)}</span>
            <button type="button" aria-label="Odebrat" onClick={() => remove(a.id)}>
              ×
            </button>
          </div>
        ))}
        {draft.files.map((f) => (
          <div className="item" key={f.key}>
            <span className="ty">Soubor</span>
            <a href={f.url} download={f.file.name}>
              {f.file.name}
            </a>
            <span className="sz">{fmtSize(f.file.size)}</span>
            <button
              type="button"
              aria-label="Odebrat"
              onClick={() => {
                URL.revokeObjectURL(f.url);
                onChange({ ...draft, files: draft.files.filter((x) => x.key !== f.key) });
              }}
            >
              ×
            </button>
          </div>
        ))}
        {links.map((a) => (
          <div className="item" key={a.id}>
            <span className="ty l">Odkaz</span>
            <a href={a.url} target="_blank" rel="noopener noreferrer">
              {a.name || a.url}
            </a>
            <button type="button" aria-label="Odebrat" onClick={() => remove(a.id)}>
              ×
            </button>
          </div>
        ))}
        {draft.links.map((l) => (
          <div className="item" key={l.key}>
            <span className="ty l">Odkaz</span>
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label || l.url}
            </a>
            <button type="button" aria-label="Odebrat" onClick={() => onChange({ ...draft, links: draft.links.filter((x) => x.key !== l.key) })}>
              ×
            </button>
          </div>
        ))}
      </div>
      <label
        className={`drop${over ? " on" : ""}`}
        id="drop"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          id="fFile"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        Přetáhněte soubory sem nebo <b>vyberte ze zařízení</b>
      </label>
      <div className="attrow">
        <input
          ref={urlRef}
          id="lUrl"
          type="url"
          inputMode="url"
          placeholder="https://…"
          style={LINK_INPUT_STYLE}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addLink();
            }
          }}
        />
        <input ref={labelRef} id="lLabel" placeholder="Popisek (nepovinné)" style={LINK_INPUT_STYLE} />
        <button className="btn outline" id="lAdd" type="button" onClick={addLink}>
          Přidat odkaz
        </button>
      </div>
    </div>
  );
}

export function draftIsEmpty(d: AttachmentDraft): boolean {
  return d.removed.size === 0 && d.files.length === 0 && d.links.length === 0;
}

/**
 * Apply the draft to a saved parent: upload pending files, add links, delete removed attachments. Every part is
 * attempted; resolves with the draft of what FAILED (empty = everything saved). Blob URLs of uploaded files are revoked.
 */
export async function applyAttachmentDraft(actions: Actions, parentKind: ParentKind, parentId: string, d: AttachmentDraft): Promise<AttachmentDraft> {
  if (draftIsEmpty(d)) return d;
  const removed = [...d.removed];
  const failedLinks: PendingLink[] = [];
  const [rm, up] = await Promise.all([
    Promise.allSettled(removed.map((id) => actions.deleteAttachment(id))),
    Promise.allSettled(d.files.map((f) => actions.uploadFile(parentKind, parentId, f.file))),
    // links sequentially keep their order (createdAt)
    (async () => {
      for (const l of d.links) await actions.addLink(parentKind, parentId, l.url, l.label).catch(() => failedLinks.push(l));
    })(),
  ]);
  const files = d.files.filter((f, i) => {
    if (up[i].status === "rejected") return true;
    URL.revokeObjectURL(f.url);
    return false;
  });
  return { removed: new Set(removed.filter((_, i) => rm[i].status === "rejected")), files, links: failedLinks };
}

/** Revoke the blob URLs of a draft that is being dropped. */
export function revokeDraft(d: AttachmentDraft): void {
  for (const f of d.files) URL.revokeObjectURL(f.url);
}

/** Attachments of one parent in display order (files then links, each by creation time). */
export function attachmentsOf(all: readonly Attachment[], parentKind: ParentKind, parentId: string | null): Attachment[] {
  if (!parentId) return [];
  return all.filter((a) => a.parentKind === parentKind && a.parentId === parentId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** „Přílohy N" counts per parent id for one parent kind. */
export function attachmentCounts(all: readonly Attachment[], parentKind: ParentKind): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of all) if (a.parentKind === parentKind) m.set(a.parentId, (m.get(a.parentId) ?? 0) + 1);
  return m;
}
