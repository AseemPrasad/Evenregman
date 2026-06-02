"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { type UpdateEventFormValues, type UpdateEventState, updateEventAction } from "@/app/(host)/host/events/[eventId]/edit/actions";
import { closeEventAction, deleteEventAction, reopenEventAction } from "@/app/(host)/host/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { eventUpdateFormSchema } from "@/schemas/event";

type EventEditFormProps = {
  eventId: string;
  initialValues: UpdateEventFormValues;
  initialStatus: "OPEN" | "FULL" | "CLOSED" | "DELETED";
};

const defaultState: UpdateEventState = { success: false };

function toDateInputValue(value: string | Date) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function EventEditForm({ eventId, initialValues, initialStatus }: EventEditFormProps) {
  const router = useRouter();
  const [actionState, setActionState] = useState<UpdateEventState>(defaultState);

  const defaults = useMemo(
    () => ({
      ...initialValues,
      date: new Date(initialValues.date).toISOString().slice(0, 10),
      registrationCutoff: toDateInputValue(initialValues.registrationCutoff)
    }),
    [initialValues]
  );

  const form = useForm<UpdateEventFormValues>({
    resolver: zodResolver(eventUpdateFormSchema),
    defaultValues: defaults,
    mode: "onTouched"
  });

  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  async function onSubmit(values: UpdateEventFormValues) {
    const response = await updateEventAction(eventId, defaultState, values);
    setActionState(response);

    if (!response.success) {
      toast.error(response.message ?? "Unable to update event");
      return;
    }

    toast.success(response.message ?? "Event updated successfully");
    router.refresh();
  }

  async function runStatusAction(action: (id: string) => Promise<{ success: boolean; message: string }>) {
    const result = await action(eventId);

    if (result.success) {
      toast.success(result.message);
      router.refresh();
      return;
    }

    toast.error(result.message);
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <div className="space-y-8">
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        {actionState.message && !actionState.success ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {actionState.message}
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Byamn Dev Meetup 2026" {...form.register("title")} />
            {errors.title ? <p className="text-sm text-destructive">{errors.title.message}</p> : null}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="Describe the agenda, speakers, and what attendees can expect." {...form.register("description")} />
            {errors.description ? <p className="text-sm text-destructive">{errors.description.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...form.register("date")} />
            {errors.date ? <p className="text-sm text-destructive">{errors.date.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="time">Time</Label>
            <Input id="time" type="time" {...form.register("time")} />
            {errors.time ? <p className="text-sm text-destructive">{errors.time.message}</p> : null}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="location">Location</Label>
            <Input id="location" placeholder="Jakarta Convention Center" {...form.register("location")} />
            {errors.location ? <p className="text-sm text-destructive">{errors.location.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input id="capacity" type="number" min={1} step={1} {...form.register("capacity", { valueAsNumber: true })} />
            {errors.capacity ? <p className="text-sm text-destructive">{errors.capacity.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="registrationCutoff">Registration cutoff</Label>
            <Input id="registrationCutoff" type="datetime-local" {...form.register("registrationCutoff")} />
            {errors.registrationCutoff ? (
              <p className="text-sm text-destructive">{errors.registrationCutoff.message}</p>
            ) : null}
          </div>
        </div>

        <Button className="w-full sm:w-auto" size="lg" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "Saving changes" : "Save changes"}
        </Button>
      </form>

      <div className="rounded-3xl border border-border/70 bg-muted/20 p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Event status</h2>
          <p className="text-sm text-muted-foreground">Manage the event lifecycle from here.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {initialStatus !== "CLOSED" ? (
            <Button type="button" variant="secondary" onClick={() => runStatusAction(closeEventAction)}>
              Close event
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => runStatusAction(reopenEventAction)}>
              Reopen event
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => runStatusAction(deleteEventAction)}>
            Soft delete
          </Button>
        </div>
      </div>
    </div>
  );
}
