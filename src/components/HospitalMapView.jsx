import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { MapPin, MousePointer2 } from "lucide-react";

const GRID = 40;
const ZONE_COLORS = {
  red:    { fill: "rgba(239,68,68,0.18)",  border: "#ef4444", label: "Red Zone" },
  yellow: { fill: "rgba(234,179,8,0.18)",  border: "#eab308", label: "Yellow Zone" },
  green:  { fill: "rgba(34,197,94,0.18)",  border: "#22c55e", label: "Green Zone" },
  blue:   { fill: "rgba(59,130,246,0.18)", border: "#3b82f6", label: "Blue Zone" },
};

export default function HospitalMapView() {
  const canvasRef = useRef(null);
  const [zones, setZones] = useState([]);
  const [beds, setBeds] = useState([]);
  const [walls, setWalls] = useState([]);
  const [chairs, setChairs] = useState([]);
  const [bgImg, setBgImg] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.8 });
  const [panning, setPanning] = useState(null);
  const [loadedImg, setLoadedImg] = useState(null);
  
  const [path, setPath] = useState([]);
  const [targetPos, setTargetPos] = useState(null);
  const [startPos, setStartPos] = useState({ x: 40, y: 40 });
  const [mode, setMode] = useState("select_end"); // select_start | select_end

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
      }
    });
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  // Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "mapConfig", "hospital"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setZones(d.zones || []);
        setBeds(d.beds || []);
        setWalls(d.walls || []);
        setChairs(d.chairs || []);
        setBgImg(d.bgImg || null);
      }
    });
    return unsub;
  }, []);

  // Preload background image
  useEffect(() => {
    if (!bgImg) {
      setLoadedImg(null);
      return;
    }
    const img = new Image();
    img.src = bgImg;
    img.onload = () => setLoadedImg(img);
  }, [bgImg]);

  // Zoom logic
  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - view.x) / view.zoom;
    const worldY = (mouseY - view.y) / view.zoom;

    const zoomSpeed = 0.001;
    const factor = Math.exp(-e.deltaY * zoomSpeed);
    const newZoom = Math.max(0.1, Math.min(5, view.zoom * factor));

    setView({
      x: mouseX - worldX * newZoom,
      y: mouseY - worldY * newZoom,
      zoom: newZoom,
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [view]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.zoom, view.zoom);

    if (loadedImg) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(loadedImg, 0, 0);
      ctx.globalAlpha = 1;
    }
    
    drawMap(ctx);
    drawPath(ctx);
    ctx.restore();
  }, [zones, beds, walls, chairs, view, loadedImg, path, targetPos, startPos]);

  const isOccupied = useCallback((gx, gy) => {
    // Check zones - only avoid if neither start nor end is in this zone
    const currentZone = zones.find(z => gx >= z.x && gx < z.x + z.w && gy >= z.y && gy < z.y + z.h);
    if (currentZone) {
      const startInZone = startPos && startPos.x >= currentZone.x && startPos.x < currentZone.x + currentZone.w && startPos.y >= currentZone.y && startPos.y < currentZone.y + currentZone.h;
      const endInZone = targetPos && targetPos.x >= currentZone.x && targetPos.x < currentZone.x + currentZone.w && targetPos.y >= currentZone.y && targetPos.y < currentZone.y + currentZone.h;
      
      if (!startInZone && !endInZone) return true;
    }

    if (beds.some(b => gx >= b.x && gx < b.x + GRID && gy >= b.y && gy < b.y + GRID)) return true;
    if (chairs.some(c => gx >= c.x && gx < c.x + GRID && gy >= c.y && gy < c.y + GRID)) return true;
    if (walls.some(w => {
      const x1 = w.x1, y1 = w.y1, x2 = w.x2, y2 = w.y2;
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      if (gx + GRID <= minX || gx >= maxX || gy + GRID <= minY || gy >= maxY) return false;
      if (x1 === x2) return gx <= x1 && gx + GRID >= x1;
      if (y1 === y2) return gy <= y1 && gy + GRID >= y1;
      const cx = gx + GRID/2, cy = gy + GRID/2;
      const d = Math.abs((x2-x1)*(y1-cy) - (x1-cx)*(y2-y1)) / Math.sqrt((x2-x1)**2 + (y2-y1)**2);
      return d < GRID/2;
    })) return true;
    return false;
  }, [zones, beds, chairs, walls, startPos, targetPos]);

  const findPath = (start, end) => {
    const startNode = { x: Math.floor(start.x / GRID) * GRID, y: Math.floor(start.y / GRID) * GRID };
    const endNode = { x: Math.floor(end.x / GRID) * GRID, y: Math.floor(end.y / GRID) * GRID };
    
    if (isOccupied(endNode.x, endNode.y)) return [];
    if (startNode.x === endNode.x && startNode.y === endNode.y) return [startNode];

    const openSet = [startNode];
    const openSetKeys = new Set([`${startNode.x},${startNode.y}`]);
    const closedSet = new Set();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const nodeKey = (n) => `${n.x},${n.y}`;
    const h = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

    gScore.set(nodeKey(startNode), 0);
    fScore.set(nodeKey(startNode), h(startNode, endNode));

    let iterations = 0;
    while (openSet.length > 0 && iterations < 1000) {
      iterations++;
      let minIdx = 0;
      let minF = fScore.get(nodeKey(openSet[0])) || Infinity;
      for (let i = 1; i < openSet.length; i++) {
        const f = fScore.get(nodeKey(openSet[i])) || Infinity;
        if (f < minF) { minF = f; minIdx = i; }
      }
      const current = openSet.splice(minIdx, 1)[0];
      const currKey = nodeKey(current);
      openSetKeys.delete(currKey);
      closedSet.add(currKey);

      if (current.x === endNode.x && current.y === endNode.y) {
        const p = [current];
        let tempKey = currKey;
        while (cameFrom.has(tempKey)) {
          const prev = cameFrom.get(tempKey);
          p.unshift(prev);
          tempKey = nodeKey(prev);
        }
        return p;
      }

      const neighbors = [
        { x: current.x + GRID, y: current.y },
        { x: current.x - GRID, y: current.y },
        { x: current.x, y: current.y + GRID },
        { x: current.x, y: current.y - GRID },
      ];

      for (const neighbor of neighbors) {
        const nbKey = nodeKey(neighbor);
        if (closedSet.has(nbKey) || isOccupied(neighbor.x, neighbor.y)) continue;
        const tentativeGScore = (gScore.get(currKey) || 0) + GRID;
        if (tentativeGScore < (gScore.get(nbKey) || Infinity)) {
          cameFrom.set(nbKey, current);
          gScore.set(nbKey, tentativeGScore);
          fScore.set(nbKey, tentativeGScore + h(neighbor, endNode));
          if (!openSetKeys.has(nbKey)) {
            openSet.push(neighbor);
            openSetKeys.add(nbKey);
          }
        }
      }
    }
    return [];
  };

  function drawPath(ctx) {
    if (path.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 4]);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.moveTo(path[0].x + GRID/2, path[0].y + GRID/2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x + GRID/2, path[i].y + GRID/2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (targetPos) {
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(targetPos.x, targetPos.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(startPos.x, startPos.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawMap(ctx) {
    ctx.strokeStyle = "rgba(148,163,184,0.1)";
    ctx.lineWidth = 1 / view.zoom;
    const startX = Math.floor(-view.x / view.zoom / GRID) * GRID;
    const startY = Math.floor(-view.y / view.zoom / GRID) * GRID;
    const endX = startX + (ctx.canvas.width / view.zoom) + GRID * 2;
    const endY = startY + (ctx.canvas.height / view.zoom) + GRID * 2;
    for (let x = startX; x <= endX; x += GRID) { ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke(); }
    for (let y = startY; y <= endY; y += GRID) { ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke(); }

    zones.forEach(z => {
      const c = ZONE_COLORS[z.color] || ZONE_COLORS.green;
      ctx.fillStyle = c.fill;
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(z.x, z.y, z.w, z.h, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.border;
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillText(z.name || c.label, z.x + 8, z.y + 16);
    });

    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    walls.forEach(w => { ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke(); });

    beds.forEach(b => {
      ctx.fillStyle = "#64748b";
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, GRID - 4, GRID - 4, 4);
      ctx.fill(); ctx.stroke();
    });

    chairs.forEach(c => {
      ctx.fillStyle = "#4b5563";
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(c.x, c.y, GRID - 10, GRID - 10, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("C", c.x + (GRID - 10) / 2, c.y + (GRID - 10) / 2 + 3);
      ctx.textAlign = "left";
    });
  }

  const onMouseDown = (e) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      setPanning({ startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y });
    }
  };
  const onMouseMove = (e) => {
    if (panning) {
      const dx = e.clientX - panning.startX;
      const dy = e.clientY - panning.startY;
      setView(prev => ({ ...prev, x: panning.origX + dx, y: panning.origY + dy }));
    }
  };
  const onMouseUp = (e) => {
    if (panning && Math.abs(e.clientX - panning.startX) < 5 && Math.abs(e.clientY - panning.startY) < 5) {
      const rect = canvasRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - view.x) / view.zoom;
      const worldY = (e.clientY - rect.top - view.y) / view.zoom;
      
      if (mode === "select_start") {
        const newStart = { 
          x: Math.floor(worldX / GRID) * GRID + GRID / 2, 
          y: Math.floor(worldY / GRID) * GRID + GRID / 2 
        };
        setStartPos(newStart);
        if (targetPos) setPath(findPath(newStart, targetPos));
        setMode("select_end");
      } else {
        const target = { 
          x: Math.floor(worldX / GRID) * GRID + GRID / 2, 
          y: Math.floor(worldY / GRID) * GRID + GRID / 2 
        };
        setTargetPos(target);
        setPath(findPath(startPos, target));
      }
    }
    setPanning(null);
  };

  return (
    <div className="w-full h-[75vh] flex flex-col bg-white rounded-3xl overflow-hidden border border-beige-200 shadow-2xl relative animate-in zoom-in-95 duration-300">
      {/* Navigator Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-white/80 backdrop-blur-md border-b border-beige-100 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm leading-none">Hospital Navigator</h3>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Select floor locations to find optimal path</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode("select_start")}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 ${
              mode === "select_start" ? "bg-green-600 text-white scale-105 shadow-green-200" : "bg-white text-slate-600 border border-beige-200 hover:bg-beige-50"
            }`}
          >
            <div className={`w-2 h-2 rounded-full bg-green-400 ${mode === "select_start" ? "animate-pulse" : ""}`} />
            Set Start
          </button>
          <button
            onClick={() => setMode("select_end")}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 ${
              mode === "select_end" ? "bg-blue-600 text-white scale-105 shadow-blue-200" : "bg-white text-slate-600 border border-beige-200 hover:bg-beige-50"
            }`}
          >
            <div className={`w-2 h-2 rounded-full bg-blue-400 ${mode === "select_end" ? "animate-pulse" : ""}`} />
            Set Destination
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-4 bg-beige-50/50 px-4 py-2 rounded-2xl border border-beige-100">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm shadow-green-200" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">You</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-200" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Target</span>
          </div>
          {Object.entries(ZONE_COLORS).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: val.border }} />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{val.label.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#faf9f6]">
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          className="w-full h-full block cursor-crosshair"
        />
        
        <div className="absolute bottom-6 left-6 flex flex-col gap-2">
          <div className="bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl shadow-2xl border border-slate-700/50 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-500">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">
              {mode === "select_start" ? "Click map to set your location" : "Click map to set destination"}
            </span>
          </div>
          <div className="bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-beige-200 shadow-sm text-[9px] font-bold text-slate-400 uppercase tracking-widest w-fit">
            Scroll to zoom • Drag to pan
          </div>
        </div>

        {path.length > 0 && (
          <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur-xl p-4 rounded-3xl border border-beige-200 shadow-2xl animate-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-xl">
                <MousePointer2 className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimated Distance</p>
                <p className="text-lg font-black text-slate-800 leading-none mt-1">{(path.length * 2.5).toFixed(1)}m</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
