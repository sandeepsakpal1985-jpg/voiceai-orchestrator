"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";

const schema = z.object({
  to: z.string().trim().min(3, "Add a recipient"),
  cc: z.string().optional(),
  body: z.string().trim().min(1, "Write a message"),
  forward: z.boolean().optional(),
});

type Values = z.infer<typeof schema>;

export function ReplyForm({ ticketId, defaultTo, defaultCc }: { ticketId: string; defaultTo: string; defaultCc: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { to: defaultTo, cc: defaultCc, body: "", forward: false } });
  async function onSubmit(values: Values) {
    setStatus(null);
    const response = await fetch(`/api/tickets/${ticketId}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        to: values.to.split(",").map((item) => item.trim()).filter(Boolean),
        cc: (values.cc ?? "").split(",").map((item) => item.trim()).filter(Boolean),
        body: values.body,
        forward: values.forward ? "true" : "false",
        clientRequestId: crypto.randomUUID(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(payload?.error?.message ?? "The reply could not be sent.");
      return;
    }
    if (payload.delivery_status === "accepted") setStatus("The mailbox accepted this reply.");
    else setStatus(`The mailbox has not accepted this reply yet (${payload.delivery_status ?? "queued"}).`);
    window.location.reload();
  }
  return (
    <form className="stack" onSubmit={form.handleSubmit(onSubmit)}>
      <label>To<input {...form.register("to")} /></label>
      <label>Cc<input {...form.register("cc")} /></label>
      <label>Message<textarea {...form.register("body")} /></label>
      <label className="row"><input type="checkbox" {...form.register("forward")} /> Forward</label>
      {form.formState.errors.body ? <p className="banner error">{form.formState.errors.body.message}</p> : null}
      {status ? <p className="banner" role="status">{status}</p> : null}
      <button className="btn" type="submit" disabled={form.formState.isSubmitting}>Send reply</button>
    </form>
  );
}
