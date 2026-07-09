import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export type WalkType = "pee" | "pee_poop";

interface WalkDialogProps {
  open: boolean;
  onConfirm: (walkType: WalkType) => void;
  onCancel: () => void;
}

const OPTIONS: { value: WalkType; label: string; emoji: string }[] = [
  { value: "pee", label: "Peed!", emoji: "💦" },
  { value: "pee_poop", label: "Peed + 💩ed", emoji: "💦💩" },
];

export function WalkDialog({ open, onConfirm, onCancel }: WalkDialogProps) {
  const [selected, setSelected] = useState<WalkType | null>(null);

  const handleConfirm = () => {
    if (selected) {
      onConfirm(selected);
      setSelected(null);
    }
  };

  const handleCancel = () => {
    setSelected(null);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">
            What kind of walk? 🐕
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-4 overflow-y-auto">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelected(option.value)}
              className={`
                relative flex flex-col items-center justify-center gap-3 p-6
                rounded-2xl border-4 transition-all duration-200 min-h-[160px]
                ${
                  selected === option.value
                    ? "border-primary bg-primary/10 scale-105 shadow-[var(--shadow-playful)]"
                    : "border-border bg-card hover:border-primary/50 hover:scale-102"
                }
              `}
            >
              {selected === option.value && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              <div className="text-5xl">{option.emoji}</div>
              <span className="text-lg font-bold text-center">{option.label}</span>
            </button>
          ))}
        </div>

        <DialogFooter className="flex-row gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1 h-12 text-base"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected}
            className="flex-1 h-12 text-base font-bold bg-gradient-to-r from-primary to-primary/80 hover:shadow-[var(--shadow-playful)]"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
