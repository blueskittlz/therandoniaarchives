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
import { Plus, LogOut, BookText, X, Pencil, Trash2, ChevronLeft, ChevronRight, Search, Download, Copy, Bookmark, BookmarkCheck, Link as LinkIcon, Type, HelpCircle, Filter } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import Editor from "@monaco-editor/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Dialog as BaseDialog } from "@/components/ui/dialog";

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

const GENRE_TAG_REGEX = /\[genre:\s*([a-zA-Z]+)\]/i;

function extractGenreFromText(text: string): Genre | null {
  const m = (text || "").match(GENRE_TAG_REGEX);
  if (!m) return null;
  const g = m[1].toLowerCase();
  const found = GENRES.find((x) => x.toLowerCase() === g);
  return found && found !== "All" ? found : null;
}

function stripGenreTag(text: string): string {
  return (text || "").replace(GENRE_TAG_REGEX, "").replace(/^\s*\n/, "").trimStart();
}

function applyGenreTag(summary: string, genre: Genre): string {
  const clean = stripGenreTag(summary);
  const tag = genre && genre !== "Misc" ? `[genre: ${genre}]\n` : "";
  return `${tag}${clean}`.trimEnd();
}

function deriveGenre(summary: string, content: string): Genre {
  const tagged = extractGenreFromText(summary) || extractGenreFromText(content);
  if (tagged) return tagged;
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

function paginate(content: string, approxCharsPerPage: number = 1400): string[] {
  const text = (content || "").trim();
  if (!text) return [""];
  const paragraphs = text.split(/\n{2,}/); // keep paragraphs intact when possible
  const pages: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + (current ? "\n\n" : "") + p).length <= approxCharsPerPage) {
      current = current ? `${current}\n\n${p}` : p;
      continue;
    }
    if (current) {
      pages.push(current);
      current = "";
    }
    if (p.length <= approxCharsPerPage) {
      current = p;
      continue;
    }
    // paragraph is too long – split by words without breaking
    const words = p.split(/\s+/);
    let chunk = "";
    for (const w of words) {
      const next = chunk ? `${chunk} ${w}` : w;
      if (next.length > approxCharsPerPage) {
        if (chunk) pages.push(chunk);
        chunk = w;
      } else {
        chunk = next;
      }
    }
    if (chunk) {
      if (current) {
        pages.push(current);
        current = "";
      }
      current = chunk;
    }
  }
  if (current) pages.push(current);
  return pages.length ? pages : [text];
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-hero/20 text-foreground rounded px-0.5">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

const Archive = () => {
  const { user, logout, loading } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<Genre>("All");
  const [expandedBook, setExpandedBook] = useState<Book | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<{ name: string; summary: string; content_md: string }>({ name: "", summary: "", content_md: "" });
  const [newGenre, setNewGenre] = useState<Genre>("Misc");
  const [editGenre, setEditGenre] = useState<Genre>("Misc");
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [readerFont, setReaderFont] = useState<number>(() => {
    const raw = localStorage.getItem("reader:fontSize");
    return raw ? Number(raw) : 16;
  });
  const [sortBy, setSortBy] = useState<"recent" | "title" | "author">("recent");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [retro, setRetro] = useState(false);
  const [snakeOpen, setSnakeOpen] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const ADD_DRAFT_KEY = "addDraft";

  const currentPages = useMemo(() => paginate(expandedBook?.content_md || ""), [expandedBook]);
  const currentPageText = currentPages[pageIndex] || "";

  const estimatedPages = useMemo(() => Math.max(1, Math.ceil(content.length / 256)), [content]);

  const canWrite = user?.role === "admin" || user?.role === "author";
  const isAdmin = user?.role === "admin";

  const fetchBooks = async () => {
    if (!supabase) return;
    try {
      setLoadingBooks(true);
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
    } finally {
      setLoadingBooks(false);
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem("favorites");
    if (raw) {
      try { setFavorites(new Set(JSON.parse(raw))); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    if (loading) return;
    fetchBooks();
  }, [loading]);

  // Debounce search input for smoother filtering
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Keyboard navigation in reader
  useEffect(() => {
    if (!expandedBook) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedBook(null);
      if (e.key === "ArrowLeft") setPageIndex((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setPageIndex((p) => Math.min(currentPages.length - 1, p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedBook, currentPages.length]);

  // Deep-link handling
  useEffect(() => {
    if (!books.length) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("book");
    if (id) {
      const found = books.find((b) => String(b.id) === id);
      if (found) setExpandedBook(found);
    }
  }, [books]);

  useEffect(() => {
    localStorage.setItem("reader:fontSize", String(readerFont));
  }, [readerFont]);

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

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      toast({ title: "Unsupported file", description: "Please drop a .txt file." });
      return;
    }
    const text = await file.text();
    setContent(text);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = () => setIsDraggingFile(false);

  const addBook = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast({ title: "No content", description: "Paste or import your book content." });
      return;
    }
    const finalTitle = title.trim() || trimmedContent.split(/\r?\n/)[0].slice(0, 48) || "Untitled Book";
    const summaryRaw = trimmedContent.split(/\r?\n/).slice(0, 5).join("\n");
    const summary = applyGenreTag(summaryRaw, newGenre);

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
    setNewGenre("Misc");
    localStorage.removeItem(ADD_DRAFT_KEY);
    setOpen(false);
    fetchBooks();
    toast({ title: "Book added", description: `“${finalTitle}” saved (${estimatedPages} page${estimatedPages > 1 ? "s" : ""}).` });
  };

  const tryEdit = (b: Book) => {
    setIsEditing(true);
    setEditDraft({ name: b.name, summary: stripGenreTag(b.summary || ""), content_md: b.content_md || "" });
    setEditGenre(deriveGenre(b.summary || "", b.content_md || ""));
  };

  const saveEdit = async () => {
    if (!expandedBook) return;
    if (!isAdmin && user?.id !== expandedBook.created_by) {
      toast({ title: "Insufficient permissions", description: "Only authors can edit their own books." });
      return;
    }
    const { error } = await supabase!.from("books").update({
      name: editDraft.name,
      summary: applyGenreTag(editDraft.summary, editGenre),
      content_md: editDraft.content_md,
      updated_at: new Date().toISOString(),
    }).eq("id", expandedBook.id);
    if (error) {
      toast({ title: "Error updating book", description: error.message });
      return;
    }
    setExpandedBook({ ...expandedBook, ...editDraft, summary: applyGenreTag(editDraft.summary, editGenre) });
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

  const toggleFavorite = (id: number) => {
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFavorites(next);
    localStorage.setItem("favorites", JSON.stringify(Array.from(next)));
  };

  const filteredBooks = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return books.filter((b) => {
      if (onlyFavorites && !favorites.has(b.id)) return false;
      const genre = deriveGenre(b.summary || "", b.content_md || "");
      const genreOk = selectedGenre === "All" || genre === selectedGenre;
      if (!q) return genreOk;
      const hay = `${b.name}\n${b.author}\n${b.summary}\n${b.content_md}`.toLowerCase();
      return genreOk && hay.includes(q);
    });
  }, [books, debouncedQuery, selectedGenre, onlyFavorites, favorites]);

  const formattedBooks = useMemo(() => {
    const list = filteredBooks.slice();
    if (sortBy === "title") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "author") list.sort((a, b) => (a.author || "").localeCompare(b.author || ""));
    else list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    // Pin favorites on top within the chosen sort
    return list.sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  }, [filteredBooks, favorites, sortBy]);

  const supabaseMissing = !supabase;

  const renderPreview = (b: Book) => {
    const previewRaw = stripGenreTag(b.summary || b.content_md || "").split(/\r?\n/).slice(0, 8).join("\n");
    const q = debouncedQuery.trim();
    return (
      <pre className="text-sm text-muted-foreground overflow-hidden whitespace-pre-wrap max-h-[160px]">{q ? highlight(previewRaw, q) : previewRaw}</pre>
    );
  };

  const copyCurrentPage = async () => {
    try {
      await navigator.clipboard.writeText(currentPageText);
      toast({ title: "Copied", description: "Current page copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard." });
    }
  };

  const downloadBook = (b: Book) => {
    const blob = new Blob([b.content_md || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${b.name || "book"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyShareLink = async (b: Book) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("book", String(b.id));
      await navigator.clipboard.writeText(url.toString());
      toast({ title: "Link copied", description: "Share link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy link." });
    }
  };

  // Autosave edit drafts locally
  useEffect(() => {
    if (!isEditing || !expandedBook) return;
    const key = `draft:${expandedBook.id}`;
    const t = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ ...editDraft, genre: editGenre }));
      setAutoSavedAt(new Date().toLocaleTimeString());
    }, 500);
    return () => clearTimeout(t);
  }, [isEditing, expandedBook, editDraft, editGenre]);

  useEffect(() => {
    if (!expandedBook) return;
    const key = `draft:${expandedBook.id}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setEditDraft({ name: parsed.name ?? editDraft.name, summary: parsed.summary ?? editDraft.summary, content_md: parsed.content_md ?? editDraft.content_md });
        if (parsed.genre) setEditGenre(parsed.genre);
      } catch {}
    }
  }, [expandedBook]);

  // Load add draft when dialog opens
  useEffect(() => {
    if (!open) return;
    const raw = localStorage.getItem(ADD_DRAFT_KEY);
    if (raw) {
      try {
        const d = JSON.parse(raw);
        if (typeof d?.title === "string") setTitle(d.title);
        if (typeof d?.content === "string") setContent(d.content);
        if (typeof d?.genre === "string" && (GENRES as readonly string[]).includes(d.genre)) setNewGenre(d.genre as Genre);
      } catch {}
    }
  }, [open]);

  // Autosave add draft
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      localStorage.setItem(ADD_DRAFT_KEY, JSON.stringify({ title, content, genre: newGenre }));
    }, 400);
    return () => clearTimeout(t);
  }, [open, title, content, newGenre]);

  const clearAddDraft = () => {
    setTitle("");
    setContent("");
    setNewGenre("Misc");
    localStorage.removeItem(ADD_DRAFT_KEY);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedGenre("All");
    setOnlyFavorites(false);
    setSortBy("recent");
  };

  const readerProgress = currentPages.length > 0 ? Math.round(((pageIndex + 1) / currentPages.length) * 100) : 0;

  // Retro Snake game component (inline, simple canvas)
  const SnakeGame: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const dirRef = useRef<[number, number]>([1, 0]);
    const snakeRef = useRef<Array<[number, number]>>([[8, 8]]);
    const appleRef = useRef<[number, number]>([12, 8]);
    const lastTickRef = useRef(0);
    const grid = 16; // 16x16
    const speedMs = 120;

    useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowUp" && dirRef.current[1] !== 1) dirRef.current = [0, -1];
        if (e.key === "ArrowDown" && dirRef.current[1] !== -1) dirRef.current = [0, 1];
        if (e.key === "ArrowLeft" && dirRef.current[0] !== 1) dirRef.current = [-1, 0];
        if (e.key === "ArrowRight" && dirRef.current[0] !== -1) dirRef.current = [1, 0];
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    useEffect(() => {
      if (!open || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      const reset = () => {
        snakeRef.current = [[8, 8]];
        dirRef.current = [1, 0];
        appleRef.current = [12, 8];
      };

      const placeApple = () => {
        appleRef.current = [Math.floor(Math.random() * grid), Math.floor(Math.random() * grid)];
      };

      const tick = (ts: number) => {
        if (!lastTickRef.current) lastTickRef.current = ts;
        const delta = ts - lastTickRef.current;
        if (delta >= speedMs) {
          lastTickRef.current = ts;
          const [dx, dy] = dirRef.current;
          const [hx, hy] = snakeRef.current[0];
          let nx = (hx + dx + grid) % grid;
          let ny = (hy + dy + grid) % grid;
          const newHead: [number, number] = [nx, ny];
          const hit = snakeRef.current.some(([x, y]) => x === nx && y === ny);
          if (hit) reset();
          snakeRef.current = [newHead, ...snakeRef.current];
          if (nx === appleRef.current[0] && ny === appleRef.current[1]) placeApple(); else snakeRef.current.pop();
        }

        // draw
        ctx.fillStyle = "#001226";
        ctx.fillRect(0, 0, 256, 256);
        // grid dots
        ctx.fillStyle = "#0a203f";
        for (let i = 0; i < grid; i++) {
          for (let j = 0; j < grid; j++) {
            ctx.fillRect(i * 16 + 7, j * 16 + 7, 2, 2);
          }
        }
        // apple
        ctx.fillStyle = "#34d399";
        ctx.fillRect(appleRef.current[0] * 16, appleRef.current[1] * 16, 16, 16);
        // snake
        ctx.fillStyle = "#93c5fd";
        snakeRef.current.forEach(([x, y]) => ctx.fillRect(x * 16, y * 16, 16, 16));

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [open]);

    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[60] bg-[#000814]/80 backdrop-blur-sm flex items-center justify-center">
        <div className="retro-window p-3 w-[320px]">
          <div className="flex items-center justify-between mb-2">
            <div className="retro-title text-sm">SNAKE.EXE</div>
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
          <div className="border border-[#3b5b92] bg-[#001226] p-2">
            <canvas ref={canvasRef} width={256} height={256} style={{ imageRendering: "pixelated", width: "100%", height: "100%" }} />
          </div>
          <div className="text-[10px] text-[#a3bffa] mt-2">Arrow keys to move. Don’t bite yourself.</div>
        </div>
      </div>
    );
  };

  return (
    <div className={(retro ? "retro " : "") + "min-h-screen bg-background relative bg-retro"}>
      {/* abstract gradient blobs */}
      {!retro && <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-hero/20 blur-3xl" aria-hidden="true" />}
      {!retro && <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-hero/10 blur-3xl" aria-hidden="true" />}
      <Helmet>
        <title>TheRandoniaArchive</title>
        <meta name="description" content="Simple Minecraft realm book backup for the Randonia community." />
        <link rel="canonical" href="/archive" />
      </Helmet>

      {!retro && <div className="absolute inset-0 pixel-grid opacity-40 pointer-events-none" aria-hidden="true" />}
      {retro && <div className="crt-overlay" aria-hidden="true" />}

      {/* tiny easter-egg pixel */}
      <div className="easter-pixel" onClick={() => setSnakeOpen(true)} title=" " />

      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-hero shadow" aria-hidden="true" />
            <span className="font-semibold">The Randonia Archive</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <span className="text-xs text-muted-foreground">Retro</span>
              <Switch checked={retro} onCheckedChange={setRetro} />
            </div>
            <Dialog open={open} onOpenChange={(next) => {
              if (!next) {
                if ((title.trim() || content.trim()) && !window.confirm("Discard your unsaved draft?")) return;
              }
              setOpen(next);
            }}>
              <DialogTrigger asChild>
                <Button variant="hero" size="sm" className="gap-1" disabled={supabaseMissing || !canWrite}>
                  <Plus className="h-4 w-4" /> Add Book
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[960px]">
                <DialogHeader>
                  <DialogTitle>Add a new book</DialogTitle>
                  <DialogDescription>Paste or import the book content and save it to your archive.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="title">Title (optional)</Label>
                        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto from first line if empty" className="retro-input" />
                      </div>
                      <div className="space-y-2">
                        <Label>Genre</Label>
                        <Select value={newGenre} onValueChange={(v) => setNewGenre(v as Genre)}>
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Select a genre" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENRES.filter((g) => g !== "All").map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="content">Book content</Label>
                          <span className="text-xs text-muted-foreground">~{estimatedPages} page{estimatedPages > 1 ? "s" : ""}</span>
                        </div>
                        <div
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          className={`rounded-md border ${isDraggingFile ? "border-dashed border-primary bg-background/50" : ""}`}
                        >
                          <Textarea
                            id="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") addBook(); }}
                            placeholder="Paste or drop a .txt file here..."
                            className="min-h-[240px]"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" onClick={pasteFromClipboard}>Paste from clipboard</Button>
                          <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={onTxtSelected} />
                          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>Import .txt</Button>
                          <Button type="button" variant="ghost" onClick={clearAddDraft}>Clear</Button>
                          <Button type="button" variant="ghost" onClick={() => setContent("Minecraft Realm Book\n\nOnce upon a time in Randonia...\n\nThis is a sample page. Replace with your own content.")}>Sample</Button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">Live preview</div>
                        <div className="text-xs text-muted-foreground">
                          {content.trim().split(/\s+/).filter(Boolean).length} words • {content.length} chars • {paginate(content).length} pages
                        </div>
                      </div>
                      <div className="rounded-md border bg-background/40 p-3 min-h-[240px]">
                        <article className="prose prose-sm max-w-none whitespace-pre-wrap">
                          {paginate(content)[0] || "Your first page will appear here..."}
                        </article>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground">Press Ctrl/⌘+Enter to save</div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                      <Button onClick={addBook} disabled={supabaseMissing || !canWrite || content.trim().length === 0}>Save</Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1"><HelpCircle className="h-4 w-4" /> Help</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>Shortcuts & tips</DialogTitle>
                  <DialogDescription>Make the archive faster to use.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Arrow Left/Right: change page</p>
                  <p>Esc: close reader</p>
                  <p>Click star: favorite; Favorites filter in the toolbar</p>
                  <p>Use the font slider in the reader header to adjust readability</p>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => { logout(); toast({ title: "Logged out" }); }}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
        {retro && (
          <div className="border-t border-b bg-[#001a33] py-2 text-center text-xs text-[#bde0ff]">
            Best viewed in <strong>Internet Explorer 4</strong> at 1024×768 • Powered by <span className="retro-pill">Frames</span> & <span className="retro-pill">Tables</span>
          </div>
        )}
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
          <div className={(retro ? "retro-window p-4 " : "") + "flex gap-6"}>
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
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xl">
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title, author, or text..." className="pl-9" />
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Sort" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Recent</SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                    <SelectItem value="author">Author</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant={onlyFavorites ? "default" : "outline"} onClick={() => setOnlyFavorites((s) => !s)} className="gap-1">
                  <Bookmark className="h-4 w-4" /> Favorites
                </Button>
                {(searchQuery || selectedGenre !== "All" || onlyFavorites || sortBy !== "recent") && (
                  <Button variant="ghost" onClick={clearFilters} className="gap-1"><Filter className="h-4 w-4" /> Clear</Button>
                )}
              </div>

              {formattedBooks.length === 0 && !loadingBooks ? (
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
              ) : loadingBooks ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
                      <div className="h-4 w-1/3 bg-muted rounded mb-2" />
                      <div className="h-3 w-2/3 bg-muted rounded mb-3" />
                      <div className="h-24 w-full bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <TooltipProvider>
                  <div className="space-y-4">
                    {formattedBooks.map((b) => (
                      <Card key={b.id} className="hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group" onClick={() => { setExpandedBook(b); const url = new URL(window.location.href); url.searchParams.set("book", String(b.id)); window.history.replaceState({}, "", url.toString()); }}>
                        <CardHeader>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <CardTitle className="truncate">{b.name}</CardTitle>
                              <CardDescription>by {b.author || "Unknown"} • {new Date(b.created_at).toLocaleDateString()}</CardDescription>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground bg-background/60">
                                  {deriveGenre(b.summary || "", b.content_md || "")}
                                </span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); toggleFavorite(b.id); }}>
                                      {favorites.has(b.id) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Favorite</TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" onClick={() => downloadBook(b)}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Export .txt</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" onClick={() => copyShareLink(b)}>
                                    <LinkIcon className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy link</TooltipContent>
                              </Tooltip>
                              {(isAdmin || (canWrite && user?.id === b.created_by)) && (
                                <>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" variant="outline" onClick={() => { setExpandedBook(b); tryEdit(b); }}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" variant="destructive" onClick={() => deleteBook(b)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete</TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="rounded-md border bg-background/40 p-3 transition-colors group-hover:bg-background/60">
                            {renderPreview(b)}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TooltipProvider>
              )}
            </section>
          </div>
        )}
      </main>

      {expandedBook && (
        <div className="fixed inset-0 z-20 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="container h-full py-6">
            <div className={(retro ? "retro-window " : "") + "relative h-full rounded-xl border bg-card shadow-xl overflow-hidden animate-in zoom-in-95 duration-200"}>
              <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
                {/* left column unchanged (actions with buttons) */}
                <div className="border-r p-4 space-y-2 bg-background/60 backdrop-blur">
                  <div className="text-sm text-muted-foreground">Title</div>
                  <div className="font-medium">{expandedBook.name}</div>
                  <div className="text-sm text-muted-foreground">Author</div>
                  <div>{expandedBook.author || "Unknown"}</div>
                  <div className="text-sm text-muted-foreground">Created</div>
                  <div>{new Date(expandedBook.created_at).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Genre</div>
                  <div>
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground bg-background/60">
                      {deriveGenre(expandedBook.summary || "", expandedBook.content_md || "")}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">Description</div>
                  <pre className="text-sm whitespace-pre-wrap text-muted-foreground max-h-40 overflow-auto">{stripGenreTag(expandedBook.summary || "") || "No description."}</pre>

                  {(isAdmin || (canWrite && user?.id === expandedBook.created_by)) && (
                    <div className="pt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => tryEdit(expandedBook)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteBook(expandedBook)}>
                        <Trash2 className="h-4 w-4" /> Delete
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => downloadBook(expandedBook)}>
                        <Download className="h-4 w-4" /> Export
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copyShareLink(expandedBook)}>
                        <LinkIcon className="h-4 w-4" /> Share
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { toggleFavorite(expandedBook.id); toast({ title: favorites.has(expandedBook.id) ? "Unfavorited" : "Favorited" }); }}>
                        {favorites.has(expandedBook.id) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                  {isEditing && autoSavedAt && (
                    <div className="text-xs text-muted-foreground">Draft autosaved at {autoSavedAt}</div>
                  )}
                </div>

                <div className="lg:col-span-2 flex flex-col h-full">
                  {isEditing ? (
                    <div className="p-4 space-y-3 overflow-auto">
                      {/* fields */}
                      <div className="space-y-2">
                        <Label htmlFor="edit-title">Title</Label>
                        <Input id="edit-title" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Genre</Label>
                        <Select value={editGenre} onValueChange={(v) => setEditGenre(v as Genre)}>
                          <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Select a genre" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENRES.filter((g) => g !== "All").map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-summary">Description</Label>
                        <Textarea id="edit-summary" className="min-h-[120px]" value={editDraft.summary} onChange={(e) => setEditDraft({ ...editDraft, summary: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-content">Content</Label>
                        <div className="rounded-md overflow-hidden border bg-background/50">
                          <Editor
                            height="360px"
                            defaultLanguage="markdown"
                            value={editDraft.content_md}
                            onChange={(v) => setEditDraft({ ...editDraft, content_md: v || "" })}
                            options={{
                              wordWrap: "on",
                              minimap: { enabled: false },
                              folding: false,
                              glyphMargin: false,
                              lineNumbers: "off",
                              renderLineHighlight: "none",
                              overviewRulerLanes: 0,
                              scrollBeyondLastLine: false,
                              smoothScrolling: true,
                              fontSize: 14,
                              lineHeight: 22,
                              padding: { top: 12, bottom: 12 },
                              scrollbar: { alwaysConsumeMouseWheel: false },
                              renderWhitespace: "selection",
                            }}
                            theme="vs-dark"
                            onMount={(editor, monaco) => {
                              try {
                                monaco.editor.defineTheme("randonia-dark", {
                                  base: "vs-dark",
                                  inherit: true,
                                  rules: [],
                                  colors: {
                                    "editor.background": "#0b1220",
                                    "editor.foreground": "#d1d5db",
                                    "editorCursor.foreground": "#93c5fd",
                                    "editorLineNumber.foreground": "#475569",
                                    "editorLineNumber.activeForeground": "#94a3b8",
                                    "editor.selectionBackground": "#1e293b88",
                                    "editor.inactiveSelectionBackground": "#0f172a66",
                                    "editorIndentGuide.background": "#1f2937",
                                    "editorIndentGuide.activeBackground": "#334155",
                                  },
                                });
                                monaco.editor.setTheme("randonia-dark");
                              } catch {}
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button onClick={saveEdit}>Save</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col">
                      <div className="flex items-center justify-between border-b px-4 py-2 bg-background/60 backdrop-blur">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setExpandedBook(null); const url = new URL(window.location.href); url.searchParams.delete("book"); window.history.replaceState({}, "", url.toString()); }} aria-label="Close">
                            <X className="h-4 w-4" />
                          </Button>
                          <div className="text-sm text-muted-foreground">Page {pageIndex + 1} / {currentPages.length}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="hidden sm:flex items-center gap-1 pr-2 border-r">
                            <Type className="h-4 w-4" />
                            <Slider value={[readerFont]} min={12} max={22} step={1} onValueChange={(v) => setReaderFont(v[0] || 16)} className="w-28" />
                          </div>
                          <TooltipProvider>
                            <div className="flex items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" onClick={() => setPageIndex((p) => Math.max(0, p - 1))} disabled={pageIndex === 0}>
                                    <ChevronLeft className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Previous page</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" onClick={() => setPageIndex((p) => Math.min(currentPages.length - 1, p + 1))} disabled={pageIndex >= currentPages.length - 1}>
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Next page</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" onClick={copyCurrentPage}>
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy page</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        </div>
                      </div>
                      <div className="h-1 bg-secondary"><div className="h-full bg-hero transition-all" style={{ width: `${readerProgress}%` }} /></div>
                      <div className="px-4 py-2">
                        <Slider value={[pageIndex]} min={0} max={Math.max(0, currentPages.length - 1)} step={1} onValueChange={(v) => setPageIndex(v[0] || 0)} />
                      </div>
                      <div className="flex-1 overflow-auto p-4">
                        <article className="prose prose-sm max-w-none whitespace-pre-wrap" style={{ fontSize: readerFont, lineHeight: 1.6 }}>
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
      <SnakeGame open={snakeOpen} onClose={() => setSnakeOpen(false)} />
    </div>
  );
};

export default Archive;
