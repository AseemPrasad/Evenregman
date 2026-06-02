"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, type InputProps } from "@/components/ui/input";

type PasswordFieldProps = InputProps & {
  label?: string;
};

export function PasswordField({ label, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-8 w-8 text-muted-foreground"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}