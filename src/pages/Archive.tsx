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
import { Plus, LogOut, BookText, X, Pencil, Trash2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DialogDescription } from "@/components/ui/dialog";

interface Book {
  id: number;
  name: string;
  author: string;
  summary: string;
  content_md: string;
  created_at: string;
  created_by?: string;
}

const GENRES = ["All", "Adventure", "Fantasy", "History", "Science", "Mystery", "Horror", "Poetry", "Biography", "Misc"] as const;

type Genre = typeof GENRES[number];

function deriveGenre(summary: string, content: string): Genre {
  const source = `${summary}\n${content}`.toLowerCase();
  if (source.includes("adventure")) return "Adventure";
  if (source.includes("fantasy")) return "Fantasy";
  if (source.includes("history")) return "History";
  if (source.includes("science")) return "Science";
  if (source.includes("mystery")) return "Mystery";
  if (source.includes("horror")) return "Horror";
  if (source.includes("poem") || source.includes("poetry")) return "Poetry";
  if (source.includes("biography") || source.includes("memoir")) return "Biography";
  return "Misc";
}

function paginate(content: string, approxCharsPerPage: number = 900): string[] {
  const trimmed = content || "";
  if (!trimmed) return [""];
  const pages: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    const end = Math.min(i + approxCharsPerPage, trimmed.length);
    pages.push(trimmed.slice(i, end));
    i = end;
  }
  return pages;
}

const Archive = () => {
  const { user, logout, loading } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<Genre>("All");
  const [expandedBook, setExpandedBook] = useState<Book | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<{ name: string; summary: string; content_md: string }>({ name: "", summary: "", content_md: "" });

  const estimatedPages = useMemo(() => Math.max(1, Math.ceil(content.length / 256)), [content]);

  const canWrite = user?.role === "admin" || user?.role === "author";
  const isAdmin = user?.role === "admin";

  const fetchBooks = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setBooks(data || []);
    } catch (err: any) {
      if (err?.status === 403) {
        toast({ title: "Restricted", description: "You must be signed in to view the archive." });
      } else {
        toast({ title: "Error loading books", description: err?.message || "Unknown error" });
      }
    }
  };

  useEffect(() => {
    if (!supabase) return;
    if (loading) return;
    fetchBooks();
  }, [loading]);

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

    if (!canWrite) {
      toast({ title: "Insufficient permissions", description: "Only authors or admins can add books." });
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

  const tryEdit = (b: Book) => {
    setIsEditing(true);
    setEditDraft({ name: b.name, summary: b.summary || "", content_md: b.content_md || "" });
  };

  const saveEdit = async () => {
    if (!expandedBook) return;
    if (!isAdmin && user?.id !== expandedBook.created_by) {
      toast({ title: "Insufficient permissions", description: "Only authors can edit their own books." });
      return;
    }
    const { error } = await supabase!.from("books").update({
      name: editDraft.name,
      summary: editDraft.summary,
      content_md: editDraft.content_md,
      updated_at: new Date().toISOString(),
    }).eq("id", expandedBook.id);
    if (error) {
      toast({ title: "Error updating book", description: error.message });
      return;
    }
    setExpandedBook({ ...expandedBook, ...editDraft });
    setIsEditing(false);
    fetchBooks();
    toast({ title: "Saved", description: "Book updated." });
  };

  const deleteBook = async (b: Book) => {
    if (!isAdmin && user?.id !== b.created_by) {
      toast({ title: "Insufficient permissions", description: "Only authors can delete their own books." });
      return;
    }
    const { error } = await supabase!.from("books").delete().eq("id", b.id);
    if (error) {
      toast({ title: "Error deleting book", description: error.message });
      return;
    }
    setExpandedBook(null);
    fetchBooks();
    toast({ title: "Deleted", description: "Book removed from archive." });
  };

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return books.filter((b) => {
      const genre = deriveGenre(b.summary || "", b.content_md || "");
      const genreOk = selectedGenre === "All" || genre === selectedGenre;
      if (!q) return genreOk;
      const hay = `${b.name}\n${b.author}\n${b.summary}\n${b.content_md}`.toLowerCase();
      return genreOk && hay.includes(q);
    });
  }, [books, searchQuery, selectedGenre]);

  const formattedBooks = useMemo(() => filteredBooks.sort((a, b) => b.created_at.localeCompare(a.created_at)), [filteredBooks]);

  const supabaseMissing = !supabase;

  const renderPreview = (b: Book) => {
    const preview = (b.summary || b.content_md || "").split(/\r?\n/).slice(0, 20).join("\n");
    return (
      <pre className="text-sm text-muted-foreground overflow-hidden whitespace-pre-wrap max-h-[320px]">{preview || "No preview available."}</pre>
    );
  };

  const currentPages = useMemo(() => paginate(expandedBook?.content_md || ""), [expandedBook]);
  const currentPageText = currentPages[pageIndex] || "";

  useEffect(() => {
    setPageIndex(0);
  }, [expandedBook]);

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
                <Button variant="hero" size="sm" className="gap-1" disabled={supabaseMissing || !canWrite}>
                  <Plus className="h-4 w-4" /> Add Book
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[720px]">
                <DialogHeader>
                  <DialogTitle>Add a new book</DialogTitle>
                  <DialogDescription>Paste or import the book content and save it to your archive.</DialogDescription>
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
                    <Button onClick={addBook} disabled={supabaseMissing || !canWrite}>Save</Button>
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
        ) : (
          <div className="flex gap-6">
            <aside className="hidden sm:block w-48 shrink-0">
              <div className="sticky top-20 space-y-2">
                <div className="text-sm font-medium mb-2">Genres</div>
                <div className="flex flex-col gap-1">
                  {GENRES.map((g) => (
                    <Button key={g} variant={selectedGenre === g ? "default" : "ghost"} className="justify-start" onClick={() => setSelectedGenre(g)}>
                      {g}
                    </Button>
                  ))}
                </div>
              </div>
            </aside>
            <section className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative w-full max-w-xl">
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title, author, or text..." className="pl-9" />
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              {formattedBooks.length === 0 ? (
                <div className="mx-auto max-w-2xl text-center rounded-lg border p-12 bg-card">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-hero shadow">
                    <BookText className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <h1 className="text-2xl font-semibold mb-2">The Archive Is Empty</h1>
                  <p className="text-muted-foreground mb-6">Be the first person to write/backup to the archive!</p>
                  <Button variant="hero" onClick={() => setOpen(true)} className="gap-1" disabled={!canWrite}>
                    <Plus className="h-4 w-4" /> Add Book
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {formattedBooks.map((b) => (
                    <Card key={b.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setExpandedBook(b)}>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <CardTitle className="truncate">{b.name}</CardTitle>
                            <CardDescription>by {b.author || "Unknown"} • {new Date(b.created_at).toLocaleDateString()} • {deriveGenre(b.summary || "", b.content_md || "")}</CardDescription>
                          </div>
                          {(isAdmin || (canWrite && user?.id === b.created_by)) && (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="outline" onClick={() => { setExpandedBook(b); tryEdit(b); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteBook(b)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {renderPreview(b)}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {expandedBook && (
        <div className="fixed inset-0 z-20 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="container h-full py-6">
            <div className="relative h-full rounded-lg border bg-card shadow-md overflow-hidden animate-in zoom-in-95 duration-200">
              <button className="absolute right-3 top-3 z-10" onClick={() => setExpandedBook(null)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
              <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
                <div className="border-r p-4 space-y-2 bg-background/50">
                  <div className="text-sm text-muted-foreground">Title</div>
                  <div className="font-medium">{expandedBook.name}</div>
                  <div className="text-sm text-muted-foreground">Author</div>
                  <div>{expandedBook.author || "Unknown"}</div>
                  <div className="text-sm text-muted-foreground">Created</div>
                  <div>{new Date(expandedBook.created_at).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Genre</div>
                  <div>{deriveGenre(expandedBook.summary || "", expandedBook.content_md || "")}</div>
                  <div className="text-sm text-muted-foreground">Description</div>
                  <pre className="text-sm whitespace-pre-wrap text-muted-foreground max-h-40 overflow-auto">{expandedBook.summary || "No description."}</pre>

                  {(isAdmin || (canWrite && user?.id === expandedBook.created_by)) && (
                    <div className="pt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => tryEdit(expandedBook)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteBook(expandedBook)}>
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 flex flex-col h-full">
                  {isEditing ? (
                    <div className="p-4 space-y-3 overflow-auto">
                      <div className="space-y-2">
                        <Label htmlFor="edit-title">Title</Label>
                        <Input id="edit-title" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-summary">Description</Label>
                        <Textarea id="edit-summary" className="min-h-[120px]" value={editDraft.summary} onChange={(e) => setEditDraft({ ...editDraft, summary: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-content">Content</Label>
                        <Textarea id="edit-content" className="min-h-[260px]" value={editDraft.content_md} onChange={(e) => setEditDraft({ ...editDraft, content_md: e.target.value })} />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button onClick={saveEdit}>Save</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col">
                      <div className="flex items-center justify-between border-b px-4 py-2">
                        <div className="text-sm text-muted-foreground">Page {pageIndex + 1} / {currentPages.length}</div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={pageIndex === 0}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPageIndex((p) => Math.min(currentPages.length - 1, p + 1))} disabled={pageIndex >= currentPages.length - 1}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto p-4">
                        <article className="prose prose-sm max-w-none whitespace-pre-wrap">
                          {currentPageText}
                        </article>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Archive;
