"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  type CreateEventFormValues,
  type CreateEventState,
  createEventAction
} from "@/app/(host)/host/events/new/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { eventCreationFormSchema } from "@/schemas/event";

const initialState: CreateEventState = {
  success: false
};

export function EventCreateForm() {
  const router = useRouter();
  const [actionState, setActionState] = useState<CreateEventState>(initialState);

  const form = useForm<CreateEventFormValues>({
    resolver: zodResolver(eventCreationFormSchema),
    defaultValues: {
      title: "",
      description: "",
      date: "",
      time: "",
      location: "",
      capacity: 1,
      registrationCutoff: ""
    },
    mode: "onTouched"
  });

  useEffect(() => {
    if (actionState.success) {
      form.reset({
        title: "",
        description: "",
        date: "",
        time: "",
        location: "",
        capacity: 1,
        registrationCutoff: ""
      });
      toast.success(actionState.message ?? "Event created successfully");
      router.refresh();
    }
  }, [actionState, form, router]);

  async function onSubmit(values: CreateEventFormValues) {
    const response = await createEventAction(initialState, values);
    setActionState(response);

    if (!response.success) {
      toast.error(response.message ?? "Unable to create event");
      return;
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
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
        {isSubmitting ? "Creating event" : "Create event"}
      </Button>

      {actionState.success && actionState.event ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Event created. Slug: <span className="font-medium">{actionState.event.slug}</span>
        </div>
      ) : null}
    </form>
  );
}
