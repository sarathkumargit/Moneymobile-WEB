"use client";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

// A form button that disables itself while the form is sending, so a double click can't send twice.
export function SubmitButton({ children, busyText = "Working…", ...props }: ButtonProps & { busyText?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending || props.disabled} {...props}>{pending ? busyText : children}</Button>;
}
