import { useEffect, useState } from "react";
import { useApp, FamilyMember } from "@/context/AppContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PencilLine, Save } from "lucide-react";
import { toast } from "sonner";

interface EditMemberDialogProps {
  open: boolean;
  onClose: () => void;
  member: FamilyMember;
}

export default function EditMemberDialog({ open, onClose, member }: EditMemberDialogProps) {
  const { updateMember } = useApp();
  const [name, setName] = useState(member.name);
  const [age, setAge] = useState(String(member.age));
  const [relationship, setRelationship] = useState(member.relationship);
  const [notes, setNotes] = useState(member.notes || "");

  useEffect(() => {
    if (open) {
      setName(member.name);
      setAge(String(member.age));
      setRelationship(member.relationship);
      setNotes(member.notes || "");
    }
  }, [open, member]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMember(member.id, {
      name: name.trim(),
      age: parseInt(age, 10),
      relationship: relationship.trim(),
      notes: notes.trim() || undefined
    })
      .then(() => {
        toast.success(`${name.trim()} updated`);
        onClose();
      })
      .catch(() => toast.error("Failed to update member details."));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="dialog-sheet">
        <DialogHeader>
          <DialogDescription className="sr-only">
            Edit family member details if any information was entered incorrectly.
          </DialogDescription>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center shadow-glow">
              <PencilLine className="h-4 w-4 text-accent-foreground" />
            </div>
            <div>
              <DialogTitle className="font-display">Edit Member</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Correct profile details</p>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5 mt-2">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-11 rounded-xl bg-background/60 border-border/50"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              placeholder="Age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
              className="h-11 rounded-xl bg-background/60 border-border/50"
            />
            <Input
              placeholder="Relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              required
              className="h-11 rounded-xl bg-background/60 border-border/50"
            />
          </div>
          <Textarea
            placeholder="Medical notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="resize-none rounded-xl bg-background/60 border-border/50"
          />
          <Button type="submit" className="w-full h-11 bg-success hover:bg-success/90 rounded-xl gap-2 font-semibold">
            <Save className="h-4 w-4" /> Save Changes
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
