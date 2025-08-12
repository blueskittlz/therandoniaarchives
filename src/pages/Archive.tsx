import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Plus, LogOut, BookText } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Book {
  id: number;
  name: string;
  author: string;
  summary: string;
  content_md: string;
  created_at: string;
}

const Archive = () => {
  const { user, logout } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const estimatedPages = useMemo(() => Math.max(1, Math.ceil(content.length / 256)), [content]);

  const fetchBooks = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading books", description: error.message });
      return;
    }
    setBooks(data || []);
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setContent(t);
      else toast({ title: "Clipboard empty", description: "Nothing to paste." });
    } catch {
      toast({ title: "Clipboard error", description: "Cannot read clipboard in this context." });
    }
  };

  const onTxtSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setContent(text);
    } finally {
      e.currentTarget.value = "";
    }
  };

  const addBook = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast({ title: "No content", description: "Paste or import your book content." });
      return;
    }
    const finalTitle = title.trim() || trimmedContent.split(/\r?\n/)[0].slice(0, 48) || "Untitled Book";
    const summary = trimmedContent.split(/\r?\n/).slice(0, 5).join("\n");

    if (!supabase) {
      toast({ title: "Supabase not configured", description: "Cannot save without Supabase credentials." });
      return;
    }

    const { error } = await supabase.from("books").insert({
      name: finalTitle,
      author: user?.username || "Unknown",
      summary,
      content_md: trimmedContent,
      created_by: user?.id,
    });

    if (error) {
      toast({ title: "Error adding book", description: error.message });
      return;
    }

    setTitle("");
    setContent("");
    setOpen(false);
    fetchBooks();
    toast({ title: "Book added", description: `“${finalTitle}” saved (${estimatedPages} page${estimatedPages > 1 ? "s" : ""}).` });
  };

  const formattedBooks = useMemo(() => books.sort((a, b) => b.created_at.localeCompare(a.created_at)), [books]);

  const supabaseMissing = !supabase;

  return (
    <div className="min-h-screen bg-background relative">
      <Helmet>
        <title>TheRandoniaArchive</title>
        <meta name="description" content="Simple Minecraft realm book backup for the Randonia community." />
        <link rel="canonical" href="/archive" />
      </Helmet>

      <div className="absolute inset-0 pixel-grid opacity-40 pointer-events-none" aria-hidden="true" />

      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-hero shadow" aria-hidden="true" />
            <span className="font-semibold">The Randonia Archive</span>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="hero" size="sm" className="gap-1" disabled={supabaseMissing}>
                  <Plus className="h-4 w-4" /> Add Book
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                  <DialogTitle>Add a new book</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title (optional)</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto from first line if empty" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="content">Book content</Label>
                      <span className="text-xs text-muted-foreground">~{estimatedPages} page{estimatedPages > 1 ? "s" : ""}</span>
                    </div>
                    <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste the full book here..." className="min-h-[220px]" />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={pasteFromClipboard}>Paste from clipboard</Button>
                      <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={onTxtSelected} />
                      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>Import .txt</Button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={addBook} disabled={supabaseMissing}>Save</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => { logout(); toast({ title: "Logged out" }); }}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <h1 className="sr-only">Randonia Book Archive</h1>
        {supabaseMissing ? (
          <div className="mx-auto max-w-2xl text-center rounded-lg border p-12 bg-card">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-hero shadow">
              <BookText className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">Supabase not configured</h1>
            <p className="text-muted-foreground mb-6">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load and save books.</p>
          </div>
        ) : formattedBooks.length === 0 ? (
          <div className="mx-auto max-w-2xl text-center rounded-lg border p-12 bg-card">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-hero shadow">
              <BookText className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">The Archive Is Empty</h1>
            <p className="text-muted-foreground mb-6">Be the first person to write/backup to the archive!</p>
            <Button variant="hero" onClick={() => setOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" /> Add Book
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {formattedBooks.map((b) => (
              <Card key={b.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="truncate">{b.name}</CardTitle>
                  <CardDescription>
                    by {b.author || "Unknown"} • {new Date(b.created_at).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground overflow-hidden">
                    {b.summary || "No preview available."}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Archive;
