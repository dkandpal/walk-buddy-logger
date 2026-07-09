import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  return (
    <Dialog open={open} onOpenChange={onCancel}>
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
              onClick={() => onConfirm(option.value)}
              className="relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-4 border-border bg-card hover:border-primary hover:scale-105 transition-all duration-200 min-h-[160px]"
            >
              <div className="text-5xl">{option.emoji}</div>
              <span className="text-lg font-bold text-center">{option.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

