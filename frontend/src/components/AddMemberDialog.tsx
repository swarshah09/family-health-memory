import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Heart, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface AddMemberDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AddMemberDialog({ open, onClose }: AddMemberDialogProps) {
  const { addMember } = useApp();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [relationship, setRelationship] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMember({ name, age: parseInt(age), relationship, notes: notes || undefined })
      .then(() => {
        toast.success(`${name} added to your family!`);
        setName("");
        setAge("");
        setRelationship("");
        setNotes("");
        onClose();
      })
      .catch(() => toast.error("Failed to add member. Check backend connection."));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dialog-sheet">
        <DialogHeader>
          <DialogDescription className="sr-only">
            Add a family member profile with age, relationship, and optional medical notes.
          </DialogDescription>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center shadow-glow">
              <UserPlus className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle className="font-display">Add Family Member</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Track their health journey</p>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5 mt-2">
          <Input
            placeholder="Name (e.g., Dad)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-11 rounded-xl bg-background/60 border-border/50 focus:border-primary/40 focus:ring-primary/20"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              placeholder="Age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
              className="h-11 rounded-xl bg-background/60 border-border/50 focus:border-primary/40 focus:ring-primary/20"
            />
            <Input
              placeholder="Relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              required
              className="h-11 rounded-xl bg-background/60 border-border/50 focus:border-primary/40 focus:ring-primary/20"
            />
          </div>
          <Textarea
            placeholder="Medical notes (optional) — e.g., medications, conditions"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="resize-none rounded-xl bg-background/60 border-border/50 focus:border-primary/40 focus:ring-primary/20"
          />
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button type="submit" className="w-full h-11 bg-success hover:bg-success/90 border-0 rounded-xl shadow-glow gap-2 font-semibold">
              <Heart className="h-4 w-4" /> Add Member
            </Button>
          </motion.div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
