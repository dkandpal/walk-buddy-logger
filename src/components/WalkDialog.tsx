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

interface WalkDialogProps {
  open: boolean;
  onConfirm: (selectedPeople: string[]) => void;
  onCancel: () => void;
}

const WALKERS = ["Deva", "Kristy", "Per", "Other"];

export function WalkDialog({ open, onConfirm, onCancel }: WalkDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const togglePerson = (person: string) => {
    setSelected((prev) =>
      prev.includes(person)
        ? prev.filter((p) => p !== person)
        : [...prev, person]
    );
  };

  const handleConfirm = () => {
    if (selected.length > 0) {
      onConfirm(selected);
      setSelected([]);
    }
  };

  const handleCancel = () => {
    setSelected([]);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">
            Who walked the dog? 🐕
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4 py-6">
          {WALKERS.map((person) => (
            <button
              key={person}
              onClick={() => togglePerson(person)}
              className={`
                relative flex flex-col items-center justify-center gap-3 p-6 
                rounded-2xl border-4 transition-all duration-200
                ${
                  selected.includes(person)
                    ? "border-primary bg-primary/10 scale-105 shadow-[var(--shadow-playful)]"
                    : "border-border bg-card hover:border-primary/50 hover:scale-102"
                }
              `}
            >
              {selected.includes(person) && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              <div className="text-5xl">
                {person === "Deva" && "👧"}
                {person === "Kristy" && "👩"}
                {person === "Per" && "👨"}
                {person === "Other" && "🙋"}
              </div>
              <span className="text-xl font-bold">{person}</span>
            </button>
          ))}
        </div>

        <DialogFooter className="flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex-1 h-14 text-lg"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.length === 0}
            className="flex-1 h-14 text-lg font-bold bg-gradient-to-r from-primary to-primary/80 hover:shadow-[var(--shadow-playful)]"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
