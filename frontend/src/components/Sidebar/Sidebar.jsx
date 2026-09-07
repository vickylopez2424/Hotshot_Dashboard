/**
 * Sidebar
 * Left panel — controls which map layers are visible.
 * Map-layer platforms are pulled from the config registry and grouped
 * into collapsible categories (Fire, Weather, Vegetation, Air Quality).
 */
import React from 'react';
import { Accordion, Checkbox, Badge, Group, Text, Stack } from '@mantine/core';
import { Activity, Flame, Layers, Leaf, Wind } from 'lucide-react';
import {
  getMapLayerPlatformsByCategory,
  LAYER_CATEGORIES,
} from '../../config/platforms';
import { usePlatform } from '../../context/PlatformContext';
import './Sidebar.css';

// Per-category mark + accent color for the group header
const CATEGORY_META = {
  Fire:          { Icon: Flame, color: 'fire' },
  Weather:       { Icon: Wind, color: 'blue' },
  Vegetation:    { Icon: Leaf, color: 'green' },
  'Air Quality': { Icon: Activity, color: 'gray' },
};

function Sidebar() {
  const { isLayerActive, toggleLayer } = usePlatform();
  const groups = getMapLayerPlatformsByCategory();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Map Layers</span>
        <small>{LAYER_CATEGORIES.length} groups</small>
      </div>

      <div className="sidebar-body">
        <Accordion
          multiple
          defaultValue={LAYER_CATEGORIES}
          variant="separated"
          chevronPosition="right"
          radius="sm"
        >
          {LAYER_CATEGORIES.map((cat) => {
            const platforms = groups[cat] || [];
            if (platforms.length === 0) return null;

            const activeCount = platforms.filter((p) =>
              isLayerActive(p.id)
            ).length;
            const meta = CATEGORY_META[cat] || { Icon: Layers, color: 'gray' };
            const CategoryIcon = meta.Icon;

            return (
              <Accordion.Item key={cat} value={cat}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap" pr={6}>
                    <Group gap={8} wrap="nowrap">
                      <span className={`category-mark ${meta.color}`}>
                        <CategoryIcon size={14} strokeWidth={2.4} />
                      </span>
                      <Text size="sm" fw={700}>{cat}</Text>
                    </Group>
                    <Badge
                      size="sm"
                      variant={activeCount ? 'filled' : 'default'}
                      color={meta.color}
                    >
                      {activeCount}/{platforms.length}
                    </Badge>
                  </Group>
                </Accordion.Control>

                <Accordion.Panel>
                  <Stack gap={10}>
                    {platforms.map((p) => (
                      <Checkbox
                        key={p.id}
                        size="sm"
                        color="fire"
                        checked={isLayerActive(p.id)}
                        onChange={() => toggleLayer(p.id)}
                        label={
                          <span className="layer-cb-label">
                            <Text size="sm" fw={500}>
                              {p.icon} {p.label}
                            </Text>
                            <Text size="xs" c="dimmed" lh={1.3}>
                              {p.description}
                            </Text>
                          </span>
                        }
                      />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      </div>
    </aside>
  );
}

export default Sidebar;
