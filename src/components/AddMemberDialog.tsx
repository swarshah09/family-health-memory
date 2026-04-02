import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
    addMember({ name, age: parseInt(age), relationship, notes: notes || undefined });
    setName("");
    setAge("");
    setRelationship("");
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Add Family Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="Name (e.g., Dad)" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input type="number" placeholder="Age" value={age} onChange={(e) => setAge(e.target.value)} required />
          <Input placeholder="Relationship (e.g., Father)" value={relationship} onChange={(e) => setRelationship(e.target.value)} required />
          <Textarea placeholder="Medical notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          <Button type="submit" className="w-full health-gradient border-0">Add Member</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
