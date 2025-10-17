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
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">
            Who walked the dog? 🐕
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-3 py-4 overflow-y-auto">
          {WALKERS.map((person) => (
            <button
              key={person}
              onClick={() => togglePerson(person)}
              className={`
                relative flex flex-col items-center justify-center gap-2 p-4 
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
              <div className="w-20 h-20 flex items-center justify-center">
                {person === "Deva" && (
                  <img 
                    src="/deva.JPG" 
                    alt="Deva" 
                    className="w-full h-full object-cover rounded-full"
                  />
                )}
                {person === "Kristy" && (
                  <img 
                    src="/kristy.jpeg" 
                    alt="Kristy" 
                    className="w-full h-full object-cover rounded-full"
                  />
                )}
                {person === "Per" && (
                  <img 
                    src="/per.jpeg" 
                    alt="Per" 
                    className="w-full h-full object-cover rounded-full"
                  />
                )}
                {person === "Other" && <div className="text-5xl">🤗</div>}
              </div>
              <span className="text-lg font-bold">{person}</span>
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
            disabled={selected.length === 0}
            className="flex-1 h-12 text-base font-bold bg-gradient-to-r from-primary to-primary/80 hover:shadow-[var(--shadow-playful)]"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
