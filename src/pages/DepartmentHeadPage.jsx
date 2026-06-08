import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../firebase";
import { doc, setDoc, onSnapshot, collection, deleteDoc, addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  LayoutGrid, Plus, Trash2, Save, Settings2,
  BedDouble, MapPin, Layers, ChevronDown, ChevronUp,
  Upload, Eye, EyeOff, Loader2, MousePointer2, Pen,
  CheckCircle2, Armchair, Info, X
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────
const GRID = 40; // px per cell
const ZONE_COLORS = {
  red:    { fill: "rgba(239,68,68,0.18)",  border: "#ef4444", label: "Red Zone (Critical)" },
  yellow: { fill: "rgba(234,179,8,0.18)",  border: "#eab308", label: "Yellow Zone (Moderate)" },
  green:  { fill: "rgba(34,197,94,0.18)",  border: "#22c55e", label: "Green Zone (Minor)" },
  blue:   { fill: "rgba(59,130,246,0.18)", border: "#3b82f6", label: "Blue Zone (Admin)" },
};

const DEFAULT_ZONES  = [];
const DEFAULT_BEDS   = [];
const DEFAULT_WALLS  = [];
const DEFAULT_CHAIRS = [];

function snap(v) { return Math.round(v / GRID) * GRID; }

// Polyfill for roundRect if not supported
function drawRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function DepartmentHeadPage() {
  const canvasRef   = useRef(null);
  const bgInputRef  = useRef(null);
  const [zones, setZones]   = useState(DEFAULT_ZONES);
  const [beds,  setBeds]    = useState(DEFAULT_BEDS);
  const [walls, setWalls]   = useState(DEFAULT_WALLS);
  const [chairs, setChairs] = useState(DEFAULT_CHAIRS);
  const [bedCounter, setBedCounter] = useState(1);
  const [bgImg, setBgImg]   = useState(null);    // data-url
  const [tool,  setTool]    = useState("select"); // select | zone | bed | wall | chair
  const [zoneColor, setZoneColor] = useState("green");
  const [selectedId, setSelectedId] = useState(null);
  const [loadedImg, setLoadedImg]   = useState(null);
  const [patients, setPatients] = useState([]);
  
  // View state for infinite map & zoom
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [panning, setPanning] = useState(null); // { startX, startY, origX, origY }

  const [dragging, setDragging] = useState(null); // { type, id, startX, startY, origX, origY }
  const [resizing, setResizing] = useState(null);
  const [drawing, setDrawing]  = useState(null);  // drawing a new zone or wall
  const [showGrid, setShowGrid] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [newDoc, setNewDoc]   = useState({ name: "", specialty: "General Medicine" });
  const [showBedInfo, setShowBedInfo] = useState(false);

  // Resize canvas to fill container accurately
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width;
        canvas.height = height;
        // Trigger a redraw by force if needed, but the view/state changes will handle it
      }
    });
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  // ── Pointer helpers ────────────────────────────────────────────────────────
  const getCanvasXY = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Screen pixels on canvas
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // World coordinates
    return {
      x: (screenX - view.x) / view.zoom,
      y: (screenY - view.y) / view.zoom,
    };
  }, [view]);

  const onWheel = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // World position under mouse before zoom
    const worldX = (mouseX - view.x) / view.zoom;
    const worldY = (mouseY - view.y) / view.zoom;

    // New zoom level
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const factor = Math.exp(delta * zoomSpeed);
    const newZoom = Math.max(0.1, Math.min(5, view.zoom * factor));

    // New offset to keep world position under mouse
    setView({
      x: mouseX - worldX * newZoom,
      y: mouseY - worldY * newZoom,
      zoom: newZoom,
    });
  };

  // load map and doctors from Firestore
  useEffect(() => {
    const unsubMap = onSnapshot(doc(db, "mapConfig", "hospital"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setZones(d.zones || []);
        setBeds(d.beds   || []);
        setWalls(d.walls || []);
        setChairs(d.chairs || []);
        if (d.beds?.length > 0) {
          const maxId = Math.max(...d.beds.map(b => parseInt(b.name?.split(" ")[1]) || 0));
          setBedCounter(maxId + 1);
        }
        setBgImg(d.bgImg  || null);
      }
    });

    const unsubDocs = onSnapshot(collection(db, "doctors"), (snap) => {
      setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubPatients = onSnapshot(collection(db, "EDMAT"), (snap) => {
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubMap(); unsubDocs(); unsubPatients(); };
  }, []);

  const handleAddDoctor = async () => {
    if (!newDoc.name) return;
    const id = `dr-${Date.now()}`;
    await setDoc(doc(db, "doctors", id), {
      ...newDoc,
      id,
      currentLoad: 0,
      totalPatientsToday: 0,
      createdAt: new Date().toISOString(),
      avatar: newDoc.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    });
    setNewDoc({ name: "", specialty: "General Medicine" });
  };

  const handleDeleteDoctor = async (id) => {
    await deleteDoc(doc(db, "doctors", id));
  };

  // ── Save ──
  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "mapConfig", "hospital"), {
        zones, beds, walls, chairs,
        bgImg: bgImg || null,
        updatedAt: new Date().toISOString(),
      });

      // Notify doctors
      await addDoc(collection(db, "notifications"), {
        title: "Map Updated",
        message: "The hospital layout and zones have been updated by the Department Head.",
        type: "map_update",
        createdAt: serverTimestamp(),
        readBy: []
      });
      
      // Sync bed names with patients if they've changed
      const updatePromises = patients.map(p => {
        if (!p.assignedBedId) return null;
        const bed = beds.find(b => b.id === p.assignedBedId);
        // If bed exists and name is different, sync it
        if (bed && bed.name !== p.assignedBedName) {
          return updateDoc(doc(db, "EDMAT", p.id), {
            assignedBedName: bed.name
          });
        }
        return null;
      }).filter(Boolean);
      
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Error saving map:", error);
    } finally {
      setSaving(false);
    }
  };

  // ── Background upload ──
  const handleBgUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBgImg(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Preload background image to avoid flicker
  useEffect(() => {
    if (!bgImg) {
      setLoadedImg(null);
      return;
    }
    const img = new Image();
    img.src = bgImg;
    img.onload = () => setLoadedImg(img);
  }, [bgImg]);

  // ── Canvas draw ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    
    // Reset transform before clearing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);

    // background image
    if (loadedImg) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(loadedImg, 0, 0); 
      ctx.globalAlpha = 1;
    }
    
    redraw(ctx);
    ctx.restore();
  }, [zones, beds, walls, chairs, selectedId, showGrid, drawing, loadedImg, view, patients]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [view]);

  function redraw(ctx) {
    // grid (infinite)
    if (showGrid) {
      ctx.strokeStyle = "rgba(148,163,184,0.15)";
      ctx.lineWidth = 1 / view.zoom;

      const viewportW = ctx.canvas.width / view.zoom;
      const viewportH = ctx.canvas.height / view.zoom;
      const startX = Math.floor(-view.x / view.zoom / GRID) * GRID;
      const startY = Math.floor(-view.y / view.zoom / GRID) * GRID;
      const endX = startX + viewportW + GRID * 2;
      const endY = startY + viewportH + GRID * 2;

      for (let x = startX; x <= endX; x += GRID) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
      for (let y = startY; y <= endY; y += GRID) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }
    }

    // zones
    zones.forEach(z => {
      const c = ZONE_COLORS[z.color] || ZONE_COLORS.green;
      ctx.fillStyle   = c.fill;
      ctx.strokeStyle = selectedId === z.id ? "#3b82f6" : c.border;
      ctx.lineWidth   = selectedId === z.id ? 2.5 : 1.5;
      ctx.beginPath();
      drawRoundRect(ctx, z.x, z.y, z.w, z.h, 6);
      ctx.fill(); ctx.stroke();

      // label
      ctx.fillStyle = c.border;
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillText(z.name || ZONE_COLORS[z.color]?.label, z.x + 8, z.y + 16);

      // rule subtitle
      if (z.maxPatientsPerDoctor) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "10px Inter, sans-serif";
        ctx.fillText(`max ${z.maxPatientsPerDoctor} pt/dr`, z.x + 8, z.y + 30);
      }

      // resize handle
      if (selectedId === z.id) {
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.arc(z.x + z.w, z.y + z.h, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // walls
    walls.forEach(w => {
      ctx.strokeStyle = selectedId === w.id ? "#3b82f6" : "#475569";
      ctx.lineWidth   = selectedId === w.id ? 5 : 3;
      ctx.lineCap     = "round";
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    });

    // in-progress drawing zone/wall
    if (drawing) {
      if (tool === "zone") {
        const c = ZONE_COLORS[zoneColor];
        ctx.fillStyle   = c.fill;
        ctx.strokeStyle = c.border;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        drawRoundRect(ctx, drawing.x, drawing.y, drawing.w, drawing.h, 6);
        ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
      } else if (tool === "wall") {
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth   = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(drawing.x1, drawing.y1);
        ctx.lineTo(drawing.x2, drawing.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // beds
    beds.forEach(b => {
      const occupant = patients.find(p => p.assignedBedId === b.id && p.status !== "completed");
      const isOccupied = !!occupant;

      ctx.fillStyle   = selectedId === b.id ? "#3b82f6" : (isOccupied ? "#f59e0b" : "#64748b");
      ctx.strokeStyle = selectedId === b.id ? "#93c5fd" : (isOccupied ? "#fbbf24" : "#94a3b8");
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      drawRoundRect(ctx, b.x, b.y, GRID - 4, GRID - 4, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 8px Inter, sans-serif";
      ctx.textAlign = "center";
      
      const label = isOccupied 
        ? (occupant.patientName || occupant.userName || "PT").split(" ")[0].toUpperCase() 
        : (b.name || "BED");
        
      ctx.fillText(label, b.x + (GRID - 4) / 2, b.y + (GRID - 4) / 2 + 3);
      ctx.textAlign = "left";
    });

    // chairs
    chairs.forEach(c => {
      ctx.fillStyle   = selectedId === c.id ? "#3b82f6" : "#4b5563";
      ctx.strokeStyle = selectedId === c.id ? "#93c5fd" : "#64748b";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      drawRoundRect(ctx, c.x, c.y, GRID - 10, GRID - 10, 4);
      ctx.fill(); ctx.stroke();
      
      // Draw a small "C" or dot
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("C", c.x + (GRID - 10) / 2, c.y + (GRID - 10) / 2 + 3);
      ctx.textAlign = "left";
    });
  }

  function hitZone(x, y) {
    return [...zones].reverse().find(z => x>=z.x && x<=z.x+z.w && y>=z.y && y<=z.y+z.h);
  }

  function hitResizeHandle(x, y) {
    return zones.find(z => {
      const dx = x - (z.x + z.w);
      const dy = y - (z.y + z.h);
      return Math.hypot(dx, dy) <= 8;
    });
  }

  function hitBed(x, y) {
    return beds.find(b => x>=b.x && x<=b.x+GRID-4 && y>=b.y && y<=b.y+GRID-4);
  }

  function hitChair(x, y) {
    return chairs.find(c => x>=c.x && x<=c.x+GRID-10 && y>=c.y && y<=c.y+GRID-10);
  }

  function hitWall(x, y) {
    return walls.find(w => {
      // Distance from point to line segment
      const L2 = (w.x2 - w.x1)**2 + (w.y2 - w.y1)**2;
      if (L2 === 0) return false;
      let t = ((x - w.x1)*(w.x2 - w.x1) + (y - w.y1)*(w.y2 - w.y1)) / L2;
      t = Math.max(0, Math.min(1, t));
      const dist = Math.hypot(x - (w.x1 + t*(w.x2 - w.x1)), y - (w.y1 + t*(w.y2 - w.y1)));
      return dist < 8;
    });
  }

  // ── Mouse events ──────────────────────────────────────────────────────────
  const onMouseDown = (e) => {
    const {x, y} = getCanvasXY(e);

    // Right-click or Middle-click to pan
    if (e.button === 1 || e.button === 2) {
      setPanning({ startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y });
      return;
    }

    if (tool === "bed") {
      const bx = snap(x) - (GRID - 4) / 2 + 2;
      const by = snap(y) - (GRID - 4) / 2 + 2;
      const id = `bed-${Date.now()}`;
      const name = `Bed ${bedCounter}`;
      setBeds(prev => [...prev, { id, name, x: Math.max(0, snap(bx)), y: Math.max(0, snap(by)) }]);
      setBedCounter(prev => prev + 1);
      return;
    }

    if (tool === "chair") {
      const cx = snap(x) - (GRID - 10) / 2 + 5;
      const cy = snap(y) - (GRID - 10) / 2 + 5;
      const id = `chair-${Date.now()}`;
      setChairs(prev => [...prev, { id, x: Math.max(0, snap(cx)), y: Math.max(0, snap(cy)) }]);
      return;
    }

    if (tool === "zone") {
      setDrawing({ x: snap(x), y: snap(y), w: GRID, h: GRID });
      return;
    }

    if (tool === "wall") {
      setDrawing({ x1: snap(x), y1: snap(y), x2: snap(x), y2: snap(y) });
      return;
    }

    if (tool === "delete") {
      const z = hitZone(x, y);
      if (z) setZones(prev => prev.filter(item => item.id !== z.id));
      const b = hitBed(x, y);
      if (b) setBeds(prev => prev.filter(item => item.id !== b.id));
      const c = hitChair(x, y);
      if (c) setChairs(prev => prev.filter(item => item.id !== c.id));
      const w = hitWall(x, y);
      if (w) setWalls(prev => prev.filter(item => item.id !== w.id));
      return;
    }

    // select tool
    const rz = hitResizeHandle(x, y);
    if (rz) {
      setSelectedId(rz.id);
      setResizing({ id: rz.id, startX: x, startY: y, origW: rz.w, origH: rz.h });
      return;
    }
    const bed = hitBed(x, y);
    if (bed) {
      setSelectedId(bed.id);
      setDragging({ type:"bed", id: bed.id, startX: x, startY: y, origX: bed.x, origY: bed.y });
      return;
    }
    const chair = hitChair(x, y);
    if (chair) {
      setSelectedId(chair.id);
      setDragging({ type:"chair", id: chair.id, startX: x, startY: y, origX: chair.x, origY: chair.y });
      return;
    }
    const wall = hitWall(x, y);
    if (wall) {
      setSelectedId(wall.id);
      return;
    }
    const zone = hitZone(x, y);
    if (zone) {
      setSelectedId(zone.id);
      setDragging({ type:"zone", id: zone.id, startX: x, startY: y, origX: zone.x, origY: zone.y });
      return;
    }
    setSelectedId(null);
  };

  const onMouseMove = (e) => {
    if (panning) {
      const dx = e.clientX - panning.startX;
      const dy = e.clientY - panning.startY;
      setView(prev => ({ ...prev, x: panning.origX + dx, y: panning.origY + dy }));
      return;
    }

    const {x, y} = getCanvasXY(e);

    if (drawing) {
      if (tool === "zone") {
        setDrawing(prev => ({
          ...prev,
          w: Math.max(GRID, snap(x) - prev.x),
          h: Math.max(GRID, snap(y) - prev.y),
        }));
      } else if (tool === "wall") {
        setDrawing(prev => ({ ...prev, x2: snap(x), y2: snap(y) }));
      }
      return;
    }
    if (resizing) {
      const dw = x - resizing.startX;
      const dh = y - resizing.startY;
      setZones(prev => prev.map(z =>
        z.id === resizing.id
          ? { ...z, w: Math.max(GRID, snap(resizing.origW + dw)), h: Math.max(GRID, snap(resizing.origH + dh)) }
          : z
      ));
      return;
    }
    if (dragging) {
      const dx = snap(x - dragging.startX);
      const dy = snap(y - dragging.startY);
      if (dragging.type === "zone") {
        setZones(prev => prev.map(z =>
          z.id === dragging.id ? { ...z, x: dragging.origX + dx, y: dragging.origY + dy } : z
        ));
      } else if (dragging.type === "bed") {
        setBeds(prev => prev.map(b =>
          b.id === dragging.id ? { ...b, x: dragging.origX + dx, y: dragging.origY + dy } : b
        ));
      } else if (dragging.type === "chair") {
        setChairs(prev => prev.map(c =>
          c.id === dragging.id ? { ...c, x: dragging.origX + dx, y: dragging.origY + dy } : c
        ));
      }
    }
  };

  const onMouseUp = (e) => {
    setPanning(null);
    const {x, y} = getCanvasXY(e);
    if (drawing) {
      if (tool === "zone") {
        const w = Math.max(GRID * 2, snap(x) - drawing.x);
        const h = Math.max(GRID * 2, snap(y) - drawing.y);
        const id = `zone-${Date.now()}`;
        setZones(prev => [...prev, {
          id, color: zoneColor, x: drawing.x, y: drawing.y, w, h,
          name: ZONE_COLORS[zoneColor].label,
          maxPatientsPerDoctor: zoneColor === "red" ? 3 : zoneColor === "yellow" ? 4 : 6,
        }]);
      } else if (tool === "wall") {
        const id = `wall-${Date.now()}`;
        setWalls(prev => [...prev, { id, x1: drawing.x1, y1: drawing.y1, x2: snap(x), y2: snap(y) }]);
      }
      setDrawing(null);
      return;
    }
    setDragging(null);
    setResizing(null);
  };

  // ── Selected object ────────────────────────────────────────────────────────
  const selectedZone = zones.find(z => z.id === selectedId);
  const selectedBed  = beds.find(b => b.id === selectedId);
  const selectedWall = walls.find(w => w.id === selectedId);
  const selectedChair = chairs.find(c => c.id === selectedId);

  const updateZone = (field, value) => {
    setZones(prev => prev.map(z => z.id === selectedId ? { ...z, [field]: value } : z));
  };

  const updateBed = (field, value) => {
    setBeds(prev => prev.map(b => b.id === selectedId ? { ...b, [field]: value } : b));
  };

  const deleteSelected = () => {
    if (selectedZone) setZones(prev => prev.filter(z => z.id !== selectedId));
    if (selectedBed)  setBeds(prev  => prev.filter(b => b.id !== selectedId));
    if (selectedWall) setWalls(prev => prev.filter(w => w.id !== selectedId));
    if (selectedChair) setChairs(prev => prev.filter(c => c.id !== selectedId));
    setSelectedId(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-50 via-beige-100 to-beige-200 flex flex-col">
      {/* Header */}
      <header className="border-b border-beige-200 bg-white/70 backdrop-blur-sm sticky top-0 z-30 flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-foreground text-base leading-none">Department Head</h1>
              <p className="text-muted-foreground text-xs mt-0.5">Hospital Zone Editor</p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <ToolBtn active={tool==="select"} onClick={() => setTool("select")} title="Select / Move">
              <MousePointer2 className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={tool==="zone"} onClick={() => setTool("zone")} title="Draw Zone">
              <Layers className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={tool==="wall"} onClick={() => setTool("wall")} title="Draw Wall">
              <Pen className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={tool==="bed"} onClick={() => setTool("bed")} title="Place Bed">
              <BedDouble className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={tool==="chair"} onClick={() => setTool("chair")} title="Place Chair">
              <Armchair className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={tool==="delete"} onClick={() => setTool("delete")} title="Delete Tool">
              <Trash2 className="w-4 h-4" />
            </ToolBtn>

            <div className="w-px h-6 bg-beige-200" />

            <button
              onClick={() => setShowGrid(v => !v)}
              className="p-2 rounded-xl bg-white border border-beige-200 text-muted-foreground hover:text-foreground hover:bg-beige-50 transition"
              title="Toggle Grid"
            >
              {showGrid ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>

            <button
              onClick={() => bgInputRef.current?.click()}
              className="p-2 rounded-xl bg-white border border-beige-200 text-muted-foreground hover:text-foreground hover:bg-beige-50 transition"
              title="Upload Background"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />

            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg ${
                saved
                  ? "bg-green-600 text-white"
                  : "bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 text-white"
              } disabled:opacity-60`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saved ? "Saved!" : "Save Map"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 overflow-hidden bg-[#faf8f4] relative">
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full block"
          />

          {/* Viewport Info */}
          <div className="absolute bottom-6 left-6 flex items-center gap-4 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-md border border-beige-200 px-4 py-2 rounded-2xl shadow-xl flex items-center gap-3">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zoom</div>
              <div className="text-sm font-bold text-slate-800">{Math.round(view.zoom * 100)}%</div>
            </div>
            <div className="bg-white/90 backdrop-blur-md border border-beige-200 px-4 py-2 rounded-2xl shadow-xl text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Right-Click or Middle-Click to Pan
            </div>
          </div>

          {/* Tool hints */}
          {tool === "zone" && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[10px] px-4 py-2 rounded-full shadow-2xl font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-4">
              Click & drag to draw {zoneColor} zone
            </div>
          )}
          {tool === "wall" && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-4 py-2 rounded-full shadow-2xl font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-4">
              Click & drag to draw wall
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 bg-white border-l border-beige-200 overflow-y-auto p-6 space-y-6 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] no-scrollbar">
          
          {/* Properties Panel */}
          {selectedId ? (
            <Panel title={<span className="flex items-center gap-2"><Settings2 className="w-4 h-4" /> Properties</span>}>
              {selectedZone && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Zone Name</label>
                    <input
                      type="text"
                      value={selectedZone.name || ""}
                      onChange={(e) => updateZone("name", e.target.value)}
                      className="w-full mt-1 bg-beige-50 border border-beige-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Zone Type</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {Object.entries(ZONE_COLORS).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => updateZone("color", key)}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-[10px] font-bold transition-all ${
                            selectedZone.color === key ? "bg-white border-violet-500 shadow-sm" : "bg-beige-50 border-transparent hover:border-beige-200"
                          }`}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: val.border }} />
                          {key}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={deleteSelected}
                    className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Zone
                  </button>
                </div>
              )}
              {selectedWall && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Wall Segment Selected</p>
                  <button
                    onClick={deleteSelected}
                    className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Wall
                  </button>
                </div>
              )}
              {selectedBed && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Bed Name / ID</label>
                    <input
                      type="text"
                      value={selectedBed.name || ""}
                      onChange={(e) => updateBed("name", e.target.value)}
                      className="w-full mt-1 bg-beige-50 border border-beige-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                  <button
                    onClick={deleteSelected}
                    className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Bed
                  </button>
                </div>
              )}
              {selectedChair && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">Waiting Chair Selected</p>
                  <button
                    onClick={deleteSelected}
                    className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Chair
                  </button>
                </div>
              )}
            </Panel>
          ) : (
            <div className="p-8 bg-beige-50 rounded-2xl border border-beige-100 border-dashed text-center">
              <MousePointer2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Select object to edit</p>
            </div>
          )}

          {/* Stats */}
          <Panel title="Map Stats">
            <div className="space-y-2">
              <StatRow label="Total Zones" value={zones.length} />
              <StatRow label="Total Walls" value={walls.length} />
              <div className="pt-2 mt-2 border-t border-beige-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Total Beds</span>
                  <span className="text-xs font-bold">{beds.length}</span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Available</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-green-600">
                      {beds.length - (Array.isArray(patients) ? patients.filter(p => p.assignedBedId && p.status !== "completed").length : 0)}
                    </span>
                    <button onClick={() => setShowBedInfo(true)} className="p-1 hover:bg-beige-100 rounded text-violet-600 transition">
                       <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              <StatRow label="Total Chairs" value={chairs.length} />
            </div>
          </Panel>

          {/* Doctor Management */}
          <Panel title={<span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Doctor Management</span>}>
            <div className="space-y-3">
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Doctor Name"
                  value={newDoc.name}
                  onChange={e => setNewDoc(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-white border border-beige-200 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <select
                  value={newDoc.specialty}
                  onChange={e => setNewDoc(prev => ({ ...prev, specialty: e.target.value }))}
                  className="w-full bg-white border border-beige-200 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                >
                  <option>General Medicine</option>
                  <option>Emergency</option>
                  <option>Cardiology</option>
                  <option>Paediatrics</option>
                </select>
                <button
                  onClick={handleAddDoctor}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  Add Doctor
                </button>
              </div>

              <div className="pt-2 border-t border-beige-100 max-h-60 overflow-y-auto space-y-2">
                {doctors.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-2 p-2 bg-beige-50 rounded-xl border border-beige-200 group">
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{d.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{d.specialty}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteDoctor(d.id)}
                      className="p-1.5 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </aside>
      </div>

      {/* Bed Info Modal */}
      {showBedInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-beige-100 flex items-center justify-between bg-beige-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500 text-white flex items-center justify-center">
                  <BedDouble className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Bed Breakdown</h3>
                  <p className="text-xs text-muted-foreground">Total and Zone-wise</p>
                </div>
              </div>
              <button onClick={() => setShowBedInfo(false)} className="p-2 hover:bg-beige-100 rounded-full transition">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-2">
                <div className="p-3 bg-violet-50 rounded-2xl border border-violet-100 text-center">
                  <p className="text-[10px] font-bold text-violet-400 uppercase">Total</p>
                  <p className="text-2xl font-black text-violet-700">{beds.length}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-2xl border border-green-100 text-center">
                  <p className="text-[10px] font-bold text-green-400 uppercase">Free</p>
                  <p className="text-2xl font-black text-green-700">
                    {beds.length - (Array.isArray(patients) ? patients.filter(p => p.assignedBedId && p.status !== "completed").length : 0)}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone Breakdown</p>
                {zones.map(z => {
                  const bedsInZone = beds.filter(b => 
                    b.x >= z.x && b.x < z.x + z.w && 
                    b.y >= z.y && b.y < z.y + z.h
                  );
                  const occupiedInZone = bedsInZone.filter(b => 
                    patients.some(p => p.assignedBedId === b.id && p.status !== "completed")
                  ).length;
                  
                  return (
                    <div key={z.id} className="flex items-center justify-between p-3 bg-beige-50/50 rounded-xl border border-beige-100">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ZONE_COLORS[z.color]?.border }} />
                        <span className="text-sm font-bold text-slate-700">{z.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900">{bedsInZone.length - occupiedInZone}</span>
                        <span className="text-xs text-slate-400 mx-1">/</span>
                        <span className="text-xs font-medium text-slate-500">{bedsInZone.length} free</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ToolBtn({ active, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-xl border text-sm transition-all ${
        active
          ? "bg-violet-600 border-violet-500 text-white shadow-lg"
          : "bg-white border-beige-200 text-muted-foreground hover:text-foreground hover:bg-beige-50 shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm border border-beige-200 rounded-2xl p-4 shadow-sm">
      <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">{title}</div>
      {children}
    </div>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold" style={{ color: color || "var(--foreground)" }}>{value}</span>
    </div>
  );
}
