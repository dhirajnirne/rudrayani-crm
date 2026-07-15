import { useEffect, useState } from "react";
import { Button, Drawer, Space, Switch, Typography, message, theme } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DASHBOARD_WIDGETS, getRoleDefaultLayout, type WidgetLayoutEntry } from "./widgetRegistry";
const TITLES = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.title]));

function SortableRow({ entry, onToggle }: { entry: WidgetLayoutEntry; onToggle: (id: string) => void }) {
  const { token } = theme.useToken();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        border: `1px solid ${token.colorBorderSecondary}`,
        marginBottom: 6,
        background: token.colorBgContainer,
      }}
    >
      <span {...attributes} {...listeners} style={{ cursor: "grab", color: token.colorTextSecondary, display: "flex" }}>
        <HolderOutlined />
      </span>
      <Typography.Text style={{ flex: 1 }}>{TITLES.get(entry.id) ?? entry.id}</Typography.Text>
      <Switch size="small" checked={entry.visible} onChange={() => onToggle(entry.id)} />
    </div>
  );
}

export default function DashboardCustomizer({
  open,
  onClose,
  layout,
  isManager,
  onSave,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  layout: WidgetLayoutEntry[] | null;
  isManager: boolean;
  onSave: (widgets: WidgetLayoutEntry[]) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<WidgetLayoutEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const base = layout ?? getRoleDefaultLayout(isManager);
      setDraft([...base].sort((a, b) => a.order - b.order));
    }
  }, [open, layout, isManager]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const toggle = (id: string) =>
    setDraft((items) => items.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft.map((d, i) => ({ ...d, order: i })));
      message.success("Dashboard layout saved");
      onClose();
    } catch {
      message.error("Could not save layout — try again");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await onReset();
      message.success("Reset to default layout");
      onClose();
    } catch {
      message.error("Could not reset layout — try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title="Customize Dashboard" open={open} onClose={onClose} width={380}>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
        Drag to reorder, toggle to show or hide. Applies only to your own view.
      </Typography.Text>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draft.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {draft.map((entry) => (
            <SortableRow key={entry.id} entry={entry} onToggle={toggle} />
          ))}
        </SortableContext>
      </DndContext>
      <Space style={{ marginTop: 16, width: "100%" }} direction="vertical">
        <Button type="primary" block loading={saving} onClick={handleSave}>
          Save as my default
        </Button>
        <Button block onClick={handleReset} disabled={saving}>
          Reset to default
        </Button>
      </Space>
    </Drawer>
  );
}
