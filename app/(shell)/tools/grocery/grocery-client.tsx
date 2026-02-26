'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type GroceryItem = {
  id: string
  tenant_id: string
  name: string
  category: string | null
  quantity: string | null
  checked: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export function GroceryClient({
  initialItems,
}: {
  initialItems: GroceryItem[]
}) {
  const [items, setItems] = useState<GroceryItem[]>(initialItems)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('grocery:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'grocery_items' },
        (payload) => {
          const newItem = payload.new as GroceryItem
          setItems((prev) => {
            if (prev.some((i) => i.id === newItem.id)) return prev
            return [...prev, newItem]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'grocery_items' },
        (payload) => {
          const updated = payload.new as GroceryItem
          setItems((prev) =>
            prev.map((i) => (i.id === updated.id ? updated : i))
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'grocery_items' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setItems((prev) => prev.filter((i) => i.id !== deletedId))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Existing categories for autocomplete
  const existingCategories = useMemo(() => {
    const cats = new Set<string>()
    items.forEach((i) => {
      if (i.category) cats.add(i.category)
    })
    return Array.from(cats).sort()
  }, [items])

  // Group items by category
  const { uncheckedGroups, checkedItems } = useMemo(() => {
    const unchecked = items.filter((i) => !i.checked)
    const checked = items.filter((i) => i.checked)

    const groups: Record<string, GroceryItem[]> = {}
    for (const item of unchecked) {
      const cat = item.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    }

    // Sort categories alphabetically, "Other" last
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      return a.localeCompare(b)
    })

    const sorted: [string, GroceryItem[]][] = sortedKeys.map((k) => [
      k,
      groups[k],
    ])

    return { uncheckedGroups: sorted, checkedItems: checked }
  }, [items])

  const addItem = useCallback(async () => {
    const name = newName.trim()
    if (!name) return

    const tempId = `temp-${Date.now()}`
    const optimistic: GroceryItem = {
      id: tempId,
      tenant_id: '',
      name,
      category: newCategory.trim() || null,
      quantity: newQuantity.trim() || null,
      checked: false,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setItems((prev) => [...prev, optimistic])
    setNewName('')
    setNewCategory('')
    setNewQuantity('')
    nameInputRef.current?.focus()

    try {
      const res = await fetch('/api/commands/create-grocery-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category: newCategory.trim() || undefined,
          quantity: newQuantity.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to add item')
      setItems((prev) =>
        prev.map((i) => (i.id === tempId ? (json.data as GroceryItem) : i))
      )
    } catch (err) {
      setItems((prev) => prev.filter((i) => i.id !== tempId))
      toast({
        message: err instanceof Error ? err.message : 'Failed to add item',
        type: 'error',
      })
    }
  }, [newName, newCategory, newQuantity])

  const toggleChecked = useCallback(
    async (item: GroceryItem) => {
      const newChecked = !item.checked
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, checked: newChecked } : i
        )
      )

      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'grocery_items',
            id: item.id,
            fields: { checked: newChecked },
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Update failed')
      } catch {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, checked: item.checked } : i
          )
        )
      }
    },
    []
  )

  const deleteItem = useCallback(
    async (id: string) => {
      const prev = items
      setItems((t) => t.filter((i) => i.id !== id))

      try {
        const res = await fetch('/api/commands/delete-entity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'grocery_items', id }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Delete failed')
      } catch {
        setItems(prev)
        toast({ message: 'Failed to delete item', type: 'error' })
      }
    },
    [items]
  )

  const clearChecked = useCallback(async () => {
    const checked = items.filter((i) => i.checked)
    if (checked.length === 0) return

    const prev = items
    setItems((t) => t.filter((i) => !i.checked))

    try {
      const res = await fetch('/api/grocery?checked=true', {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Clear failed')
    } catch {
      setItems(prev)
      toast({ message: 'Failed to clear checked items', type: 'error' })
    }
  }, [items])

  const startEditing = useCallback((item: GroceryItem) => {
    setEditingId(item.id)
    setEditingName(item.name)
  }, [])

  const saveEditing = useCallback(
    async (item: GroceryItem) => {
      const name = editingName.trim()
      setEditingId(null)
      if (!name || name === item.name) return

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, name } : i))
      )

      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'grocery_items',
            id: item.id,
            fields: { name },
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Update failed')
      } catch {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, name: item.name } : i
          )
        )
      }
    },
    [editingName]
  )

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const checkedCount = checkedItems.length

  return (
    <div className="max-w-2xl mx-auto w-full py-4 px-2">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Grocery List</h1>
        {checkedCount > 0 && (
          <Button variant="outline" size="sm" onClick={clearChecked}>
            Clear checked ({checkedCount})
          </Button>
        )}
      </div>

      {/* Add item form */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          addItem()
        }}
        className="flex gap-2 mb-6"
      >
        <Input
          ref={nameInputRef}
          placeholder="Add item…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1"
        />
        <Input
          placeholder="Category"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          list="category-list"
          className="w-36"
        />
        <Input
          placeholder="Qty"
          value={newQuantity}
          onChange={(e) => setNewQuantity(e.target.value)}
          className="w-20"
        />
        <Button type="submit" size="icon" disabled={!newName.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
        <datalist id="category-list">
          {existingCategories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
      </form>

      {/* Unchecked items grouped by category */}
      {uncheckedGroups.length === 0 && checkedCount === 0 && (
        <p className="text-muted-foreground text-center py-12">
          No items yet. Add something above.
        </p>
      )}

      {uncheckedGroups.map(([category, groupItems]) => (
        <div key={category} className="mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {category}
          </h2>
          <div className="space-y-1">
            {groupItems.map((item) => (
              <GroceryRow
                key={item.id}
                item={item}
                isEditing={editingId === item.id}
                editingName={editingName}
                editInputRef={
                  editingId === item.id ? editInputRef : undefined
                }
                onEditNameChange={setEditingName}
                onToggle={() => toggleChecked(item)}
                onDelete={() => deleteItem(item.id)}
                onStartEdit={() => startEditing(item)}
                onSaveEdit={() => saveEditing(item)}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Checked items at bottom */}
      {checkedCount > 0 && (
        <div className="mt-6 pt-4 border-t border-border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Checked
          </h2>
          <div className="space-y-1">
            {checkedItems.map((item) => (
              <GroceryRow
                key={item.id}
                item={item}
                isEditing={false}
                editingName=""
                onEditNameChange={() => {}}
                onToggle={() => toggleChecked(item)}
                onDelete={() => deleteItem(item.id)}
                onStartEdit={() => {}}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GroceryRow({
  item,
  isEditing,
  editingName,
  editInputRef,
  onEditNameChange,
  onToggle,
  onDelete,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  item: GroceryItem
  isEditing: boolean
  editingName: string
  editInputRef?: React.RefObject<HTMLInputElement | null>
  onEditNameChange: (name: string) => void
  onToggle: () => void
  onDelete: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors',
        item.checked && 'opacity-50'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={cn(
          'flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors',
          item.checked
            ? 'bg-primary border-primary'
            : 'border-muted-foreground hover:border-primary'
        )}
      >
        {item.checked && <Check className="h-3 w-3 text-primary-foreground" />}
      </button>

      {/* Name + quantity */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSaveEdit()
            }}
            className="flex items-center gap-2"
          >
            <Input
              ref={editInputRef}
              value={editingName}
              onChange={(e) => onEditNameChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onCancelEdit()
              }}
              className="h-7 text-sm"
            />
          </form>
        ) : (
          <button
            onClick={item.checked ? undefined : onStartEdit}
            className={cn(
              'text-left truncate',
              item.checked && 'line-through',
              !item.checked && 'cursor-text hover:underline'
            )}
          >
            {item.name}
            {item.quantity && (
              <span className="text-muted-foreground ml-1">
                ({item.quantity})
              </span>
            )}
          </button>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
