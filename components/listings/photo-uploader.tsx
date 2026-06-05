"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Loader2, X, ImagePlus, AlertTriangle } from "lucide-react";

import { uploadListingPhoto, removeListingPhoto } from "@/lib/actions/listings";
import { Button } from "@/components/ui/button";

// Drag-drop photo grid (CONTEXT: up to 8 photos, drag-drop reorder, first=cover,
// immediate per-photo upload with a per-photo spinner — NOT one global bar). EXIF
// is stripped SERVER-SIDE inside uploadListingPhoto (invariant #4); there is no
// metadata handling in this UI at all. We use @dnd-kit/sortable (05-RESEARCH
// "Don't Hand-Roll" → NEVER native HTML5 DnD).
//
// FLOW per selected file:
//   1. create a local URL.createObjectURL preview, push status "uploading"
//   2. call uploadListingPhoto(formData{file}); the server strips EXIF then uploads
//      the clean WebP to the caller's staging folder, returning its storage path
//   3. on ok → status "ready" + store path; on error → status "error" + toast
// The parent form reads the ordered path[] of READY photos (this becomes photoPaths;
// index 0 is the cover). Removing a tile deletes its staged object server-side.

export type UploadedPhoto = {
  id: string;
  path: string | null;
  previewUrl: string;
  status: "uploading" | "ready" | "error";
};

const MAX_PHOTOS = 8;
const ACCEPT = "image/jpeg,image/png,image/webp";

// Friendly upload-error copy (Pitfall 2: HEIC/unsupported is the #1 confusion).
function uploadErrorMessage(error: string): string {
  switch (error) {
    case "unsupported_type":
      return "Please upload JPG, PNG, or WebP — HEIC isn't supported; your phone can export JPG.";
    case "too_large":
      return "That image is too large. Please upload a smaller photo.";
    case "decode_failed":
      return "We couldn't read that image. Please try a different photo.";
    case "unauthenticated":
      return "Your session expired — please log in again.";
    case "upload_failed":
    case "invalid":
    default:
      return "Something went wrong uploading that photo. Please try again.";
  }
}

function SortableTile({
  photo,
  isCover,
  onRemove,
}: {
  photo: UploadedPhoto;
  isCover: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-muted relative aspect-square overflow-hidden rounded-md border"
    >
      {/* The image is the drag handle so reordering feels natural. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.previewUrl}
        alt=""
        className="h-full w-full cursor-grab touch-none object-cover active:cursor-grabbing"
        {...attributes}
        {...listeners}
        draggable={false}
      />

      {isCover && photo.status === "ready" && (
        <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
          Cover
        </span>
      )}

      {photo.status === "uploading" && (
        <div className="bg-background/60 absolute inset-0 grid place-items-center">
          <Loader2 className="text-foreground size-6 animate-spin" />
        </div>
      )}

      {photo.status === "error" && (
        <div className="bg-destructive/15 absolute inset-0 grid place-items-center">
          <AlertTriangle className="text-destructive size-6" />
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="bg-background/80 text-foreground hover:bg-background absolute top-1 right-1 grid size-6 place-items-center rounded-full border"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function PhotoUploader({
  value,
  onChange,
}: {
  value: UploadedPhoto[];
  onChange: (next: UploadedPhoto[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Keep a ref of the current value so async upload callbacks update the latest
  // list (React state in closures would otherwise be stale). Synced in an effect
  // so we never mutate a ref during render.
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Revoke any object URLs on unmount to avoid memory leaks.
  React.useEffect(() => {
    return () => {
      for (const p of valueRef.current) {
        URL.revokeObjectURL(p.previewUrl);
      }
    };
  }, []);

  function patchPhoto(id: string, patch: Partial<UploadedPhoto>) {
    onChange(
      valueRef.current.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  async function uploadOne(id: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const result = await uploadListingPhoto(form);
    if (result.ok) {
      patchPhoto(id, { status: "ready", path: result.path });
    } else {
      patchPhoto(id, { status: "error" });
      toast.error(uploadErrorMessage(result.error));
    }
  }

  function onFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;

    const current = valueRef.current;
    const remaining = MAX_PHOTOS - current.length;
    if (remaining <= 0) {
      toast.error(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const picked = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`You can upload up to ${MAX_PHOTOS} photos.`);
    }

    const staged: UploadedPhoto[] = picked.map((file) => ({
      id: crypto.randomUUID(),
      path: null,
      previewUrl: URL.createObjectURL(file),
      status: "uploading" as const,
    }));

    onChange([...current, ...staged]);

    // Kick off the per-photo uploads (EXIF stripped server-side).
    staged.forEach((p, i) => {
      void uploadOne(p.id, picked[i]);
    });

    // Reset the input so re-selecting the same file fires change again.
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onRemoveTile(photo: UploadedPhoto) {
    URL.revokeObjectURL(photo.previewUrl);
    onChange(valueRef.current.filter((p) => p.id !== photo.id));
    if (photo.path) {
      // Best-effort: drop the staged object from Storage.
      void removeListingPhoto(photo.path);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = valueRef.current.findIndex((p) => p.id === active.id);
    const newIndex = valueRef.current.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(valueRef.current, oldIndex, newIndex));
  }

  const atLimit = value.length >= MAX_PHOTOS;

  return (
    <div className="grid gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => onFilesSelected(e.target.files)}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={value.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {value.map((photo, index) => (
              <SortableTile
                key={photo.id}
                photo={photo}
                isCover={index === 0}
                onRemove={() => void onRemoveTile(photo)}
              />
            ))}

            {!atLimit && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-muted-foreground hover:bg-muted/50 grid aspect-square place-items-center gap-1 rounded-md border border-dashed text-xs"
              >
                <ImagePlus className="size-6" />
                Add photos
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <p className="text-muted-foreground text-xs">
        Up to {MAX_PHOTOS} photos (JPG, PNG, or WebP). Drag to reorder — the
        first photo is the cover.
      </p>

      {value.length === 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          className="w-fit"
        >
          <ImagePlus className="size-4" />
          Add photos
        </Button>
      )}
    </div>
  );
}
