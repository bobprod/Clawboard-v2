import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  Play,
  CheckCircle2,
  Archive,
  GripVertical,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/apiFetch";
import { useSSE } from "../hooks/useSSE";

const BASE = "http://localhost:4000";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  name: string;
  status: string;
  agent?: string;
  skillName?: string;
  instructions?: string;
  scheduledAt?: string;
  createdAt?: string;
}

type ColumnId = "todo" | "in_progress" | "done" | "archived";

interface Column {
  id: ColumnId;
  title: string;
  statuses: string[];
  icon: React.ReactNode;
  color: string;
  bgGlow: string;
}

const COLUMNS: Column[] = [
  {
    id: "todo",
    title: "A faire",
    statuses: ["planned", "pending"],
    icon: <Clock size={16} />,
    color: "#a1a1aa",
    bgGlow: "rgba(161,161,170,0.05)",
  },
  {
    id: "in_progress",
    title: "En cours",
    statuses: ["running"],
    icon: <Play size={16} />,
    color: "#3b82f6",
    bgGlow: "rgba(59,130,246,0.08)",
  },
  {
    id: "done",
    title: "Termine",
    statuses: ["completed"],
    icon: <CheckCircle2 size={16} />,
    color: "#10b981",
    bgGlow: "rgba(16,185,129,0.05)",
  },
  {
    id: "archived",
    title: "Archive / Echoue",
    statuses: ["failed", "cancelled"],
    icon: <Archive size={16} />,
    color: "#ef4444",
    bgGlow: "rgba(239,68,68,0.05)",
  },
];

const STATUS_FROM_COLUMN: Record<ColumnId, string> = {
  todo: "planned",
  in_progress: "running",
  done: "completed",
  archived: "failed",
};

function getColumnForTask(task: Task): ColumnId {
  for (const col of COLUMNS) {
    if (col.statuses.includes(task.status)) return col.id;
  }
  return "todo";
}

// ─── Sortable Card ───────────────────────────────────────────────────────────

interface SortableCardProps {
  task: Task;
  columnColor: string;
}

function SortableCard({ task, columnColor }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="kanban-card"
      {...attributes}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div
          {...listeners}
          style={{
            cursor: "grab",
            color: "var(--text-muted)",
            opacity: 0.4,
            flexShrink: 0,
            paddingTop: 2,
          }}
        >
          <GripVertical size={14} />
        </div>
        <Link
          to={`/tasks/${task.id}`}
          style={{
            textDecoration: "none",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: "0.875rem",
              color: "var(--text-primary)",
              lineHeight: 1.3,
              borderLeft: `3px solid ${columnColor}`,
              paddingLeft: 8,
            }}
          >
            {task.name}
          </div>
          {task.instructions && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: 4,
                paddingLeft: 11,
                lineHeight: 1.4,
              }}
            >
              {task.instructions.length > 80
                ? task.instructions.slice(0, 80) + "..."
                : task.instructions}
            </div>
          )}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 8,
              paddingLeft: 11,
              alignItems: "center",
            }}
          >
            {task.agent && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 7px",
                  borderRadius: 5,
                  background: "rgba(59,130,246,0.1)",
                  color: "var(--brand-primary)",
                  fontWeight: 600,
                }}
              >
                {task.agent}
              </span>
            )}
            {task.skillName && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "2px 7px",
                  borderRadius: 5,
                  background: "rgba(139,92,246,0.1)",
                  color: "var(--brand-accent)",
                  fontWeight: 600,
                }}
              >
                {task.skillName}
              </span>
            )}
          </div>
        </Link>
      </div>
    </div>
  );
}

// ─── Drag Overlay Card ───────────────────────────────────────────────────────

function OverlayCard({ task, columnColor }: SortableCardProps) {
  return (
    <div
      className="kanban-card dragging"
      style={{
        borderLeft: `4px solid ${columnColor}`,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        transform: "rotate(2deg)",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: "0.875rem",
          color: "var(--text-primary)",
        }}
      >
        {task.name}
      </div>
    </div>
  );
}

// ─── Droppable Column ────────────────────────────────────────────────────────

interface DroppableColumnProps {
  column: Column;
  tasks: Task[];
}

function DroppableColumn({ column, tasks }: DroppableColumnProps) {
  return (
    <div
      className="kanban-column"
      style={{
        borderTop: `3px solid ${column.color}`,
        backgroundImage: `linear-gradient(to bottom, ${column.bgGlow}, transparent 120px)`,
        minWidth: 280,
        flex: 1,
      }}
    >
      {/* Column Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: "0.85rem",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: column.color,
          }}
        >
          {column.icon} {column.title}
        </div>
        <span
          style={{
            fontSize: "12px",
            background: "rgba(255,255,255,0.08)",
            padding: "2px 10px",
            borderRadius: 10,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} columnColor={column.color} />
          ))}
          {tasks.length === 0 && (
            <div
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "12px",
                opacity: 0.5,
              }}
            >
              Glissez une carte ici
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Main DndKanban Component ────────────────────────────────────────────────

export const DndKanban = () => {
  const { data: liveTasks } = useSSE<Task[] | null>("/api/tasks?stream=1", null);
  const tasks: Task[] = liveTasks ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, Partial<Task>>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Merge live tasks with optimistic overrides
  const mergedTasks = tasks.map((t) =>
    optimistic[t.id] ? { ...t, ...optimistic[t.id] } : t
  );

  // Group tasks by column
  const tasksByColumn = useMemo(() => {
    const grouped: Record<ColumnId, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
      archived: [],
    };
    for (const task of mergedTasks) {
      if ((task as any)._deleted) continue;
      const colId = getColumnForTask(task);
      grouped[colId].push(task);
    }
    return grouped;
  }, [mergedTasks]);

  const findColumnForTask = useCallback(
    (taskId: string): ColumnId | null => {
      for (const [colId, colTasks] of Object.entries(tasksByColumn) as [ColumnId, Task[]][]) {
        if (colTasks.some((t) => t.id === taskId)) return colId;
      }
      return null;
    },
    [tasksByColumn]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      // Find which columns the items belong to
      const activeCol = findColumnForTask(activeId);
      const overCol = findColumnForTask(overId) || (overId as ColumnId);

      if (!activeCol || activeCol === overCol) return;

      // Move task to new column (optimistic)
      const newStatus = STATUS_FROM_COLUMN[overCol as ColumnId];
      if (newStatus) {
        setOptimistic((prev) => ({
          ...prev,
          [activeId]: { status: newStatus },
        }));
      }
    },
    [findColumnForTask]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) {
        setOptimistic({});
        return;
      }

      const activeId = active.id as string;
      const overId = over.id as string;

      // Determine final column
      const overCol =
        findColumnForTask(overId) || (COLUMNS.some((c) => c.id === overId) ? (overId as ColumnId) : null);

      if (!overCol) {
        setOptimistic({});
        return;
      }

      const newStatus = STATUS_FROM_COLUMN[overCol];
      const updatePayload: Record<string, unknown> = { status: newStatus };

      if (newStatus === "running") updatePayload.startedAt = new Date().toISOString();
      if (newStatus === "completed") updatePayload.completedAt = new Date().toISOString();

      // Optimistic update
      setOptimistic((prev) => ({
        ...prev,
        [activeId]: updatePayload as Partial<Task>,
      }));

      // Persist to backend
      try {
        await apiFetch(`${BASE}/api/tasks/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatePayload),
        });
      } catch {
        // revert on error
      }

      // Clear optimistic after SSE catches up
      setTimeout(() => {
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[activeId];
          return next;
        });
      }, 1500);
    },
    [findColumnForTask]
  );

  const activeTask = activeId ? mergedTasks.find((t) => t.id === activeId) : null;
  const activeCol = activeTask ? getColumnForTask(activeTask) : "todo";
  const activeColumnColor = COLUMNS.find((c) => c.id === activeCol)?.color || "#a1a1aa";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%", paddingBottom: 16 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.4rem", margin: 0, letterSpacing: "-0.5px", color: "var(--text-primary)" }}>
            Kanban Board
          </h2>
          <div style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: 4 }}>
            Glissez-deposez les cartes entre les colonnes
          </div>
        </div>
        <Link
          to="/tasks/new"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            background: "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))",
            color: "#fff",
            borderRadius: "var(--radius-full)",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.9rem",
            boxShadow: "0 4px 20px rgba(139,92,246,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <Plus size={16} /> Nouvelle tache
        </Link>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div
          style={{
            display: "flex",
            gap: 20,
            flexGrow: 1,
            overflowX: "auto",
            paddingBottom: 16,
            scrollSnapType: "x mandatory",
          }}
        >
          {COLUMNS.map((column) => (
            <DroppableColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn[column.id]}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <OverlayCard task={activeTask} columnColor={activeColumnColor} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
