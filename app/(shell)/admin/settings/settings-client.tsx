'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Settings, Eye, EyeOff, Check, Loader2, Search } from 'lucide-react'

type ModelOption = { id: string; name: string }

interface SettingsClientProps {
  settings: Record<string, unknown> | null
  supabaseProjectId: string
}

export function SettingsClient({ settings, supabaseProjectId }: SettingsClientProps) {
  // Workspace
  const [name, setName] = useState((settings?.name as string) ?? '')
  const [nameSaved, setNameSaved] = useState(false)
  const nameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // LLM
  const [apiKey, setApiKey] = useState((settings?.openrouter_api_key as string) ?? '')
  const [showKey, setShowKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  // Model selector
  const [model, setModel] = useState((settings?.default_model as string) ?? 'openai/gpt-4o-mini')
  const [models, setModels] = useState<ModelOption[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [savingModel, setSavingModel] = useState(false)
  const [modelSaved, setModelSaved] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch models on mount
  useEffect(() => {
    let cancelled = false
    setLoadingModels(true)
    fetch('/api/admin/settings/models')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load models')))
      .then((json: { models: ModelOption[] }) => {
        if (!cancelled) setModels(json.models ?? [])
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingModels(false) })
    return () => { cancelled = true }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const patchSettings = useCallback(async (body: Record<string, string>) => {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error((json as { error?: string }).error ?? 'Request failed')
    }
  }, [])

  // Save workspace name on blur (debounced)
  const handleNameBlur = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === (settings?.name as string)) return
    try {
      await patchSettings({ name: trimmed })
      setNameSaved(true)
      if (nameSaveTimer.current) clearTimeout(nameSaveTimer.current)
      nameSaveTimer.current = setTimeout(() => setNameSaved(false), 2000)
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save name' })
    }
  }, [name, settings?.name, patchSettings])

  // Save API key
  const handleSaveKey = useCallback(async () => {
    setSavingKey(true)
    try {
      await patchSettings({ openrouter_api_key: apiKey })
      setKeySaved(true)
      setTimeout(() => setKeySaved(false), 2000)
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save API key' })
    } finally {
      setSavingKey(false)
    }
  }, [apiKey, patchSettings])

  // Save model selection
  const handleSelectModel = useCallback(async (modelId: string) => {
    setModel(modelId)
    setShowDropdown(false)
    setModelSearch('')
    setSavingModel(true)
    try {
      await patchSettings({ default_model: modelId })
      setModelSaved(true)
      setTimeout(() => setModelSaved(false), 2000)
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save model' })
    } finally {
      setSavingModel(false)
    }
  }, [patchSettings])

  const filteredModels = modelSearch
    ? models.filter(m =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : models

  const currentModelName = models.find(m => m.id === model)?.name ?? model

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <div className="max-w-xl space-y-8">
        {/* Workspace section */}
        <section className="rounded-lg border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Workspace</h2>

          <div className="space-y-2">
            <Label htmlFor="workspace-name">Name</Label>
            <div className="relative">
              <Input
                id="workspace-name"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={handleNameBlur}
              />
              {nameSaved && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-green-500">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supabase-project">Project ID</Label>
            <Input
              id="supabase-project"
              value={supabaseProjectId}
              readOnly
              className="bg-muted/40 cursor-not-allowed font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Read-only. Derived from environment.</p>
          </div>
        </section>

        {/* AI / LLM section */}
        <section className="rounded-lg border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">AI / LLM</h2>

          <div className="space-y-2">
            <Label htmlFor="openrouter-key">OpenRouter API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="openrouter-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={handleSaveKey} disabled={savingKey} size="sm" className="shrink-0">
                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : keySaved ? <><Check className="h-4 w-4" /> Saved</> : 'Save Key'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used for AI summaries and task suggestions. Get one at{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="underline">
                openrouter.ai/keys
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Default Model</Label>
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-muted/40"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <span className="truncate">
                  {savingModel ? 'Saving...' : modelSaved ? `${currentModelName} \u2714` : currentModelName}
                </span>
                <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>

              {showDropdown && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                  <div className="p-2">
                    <Input
                      placeholder="Search models..."
                      value={modelSearch}
                      onChange={e => setModelSearch(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto px-1 pb-1">
                    {loadingModels ? (
                      <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading models...
                      </div>
                    ) : filteredModels.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">No models found</p>
                    ) : (
                      filteredModels.slice(0, 50).map(m => (
                        <button
                          key={m.id}
                          type="button"
                          className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${m.id === model ? 'bg-accent' : ''}`}
                          onClick={() => handleSelectModel(m.id)}
                        >
                          <span className="font-medium">{m.name}</span>
                          <span className="text-xs text-muted-foreground">{m.id}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Model used for AI features (meeting summaries, task suggestions).
            </p>
          </div>
        </section>

        {/* Deals label section */}
        <section className="rounded-lg border border-border p-5 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Labels</h2>
          <div className="space-y-1">
            <Label>Deal Label</Label>
            <p className="text-sm">&ldquo;Deal&rdquo;</p>
            <p className="text-xs text-muted-foreground">
              Configurable via <code className="text-xs bg-muted px-1 rounded">DEAL_LABEL</code> environment variable.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
