import { useState } from "react";
import { Keyboard, X } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

function accelerator(event: React.KeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");
  if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
  let key = event.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  else if (key.startsWith("Arrow")) key = key.slice(5);
  if (modifiers.length === 0 || ["Escape", "Tab"].includes(key)) return null;
  return [...modifiers, key].join("+");
}

export function HotkeyInput({ value, onChange, disabled }: { value?: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [capturing, setCapturing] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        className={cn("flex h-9 min-w-32 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground outline-none transition", capturing && "border-primary ring-2 ring-primary/20 text-foreground")}
        onFocus={() => setCapturing(true)} onBlur={() => setCapturing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.currentTarget.blur(); return; }
          event.preventDefault();
          const next = accelerator(event);
          if (next) { onChange(next); setCapturing(false); event.currentTarget.blur(); }
        }}
      >
        <Keyboard className="h-3.5 w-3.5" />
        {capturing ? "请按组合键…" : value || "绑定快捷键"}
      </button>
      {value && <Button type="button" variant="ghost" size="icon" title="清除快捷键" onClick={() => onChange("")}><X className="h-4 w-4" /></Button>}
    </div>
  );
}
