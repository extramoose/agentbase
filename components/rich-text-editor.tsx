'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { cn } from '@/lib/utils'

function getMarkdown(ed: Editor): string {
  // tiptap-markdown adds storage.markdown at runtime but lacks types
  const s = ed.storage as unknown as Record<string, { getMarkdown: () => string }>
  return s.markdown.getMarkdown()
}
import {
  Bold, Italic,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Code, Minus,
} from 'lucide-react'

interface RichTextEditorProps {
  value: string
  onChange?: (md: string) => void
  onBlur?: (md: string) => void
  placeholder?: string
  readOnly?: boolean
  className?: string
  minHeight?: string
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  readOnly = false,
  className,
  minHeight = '120px',
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown.configure({
        html: false,
        tightLists: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    onUpdate: ({ editor: ed }) => {
      const md = getMarkdown(ed)
      onChangeRef.current?.(md)
    },
    onBlur: ({ editor: ed }) => {
      const md = getMarkdown(ed)
      onBlurRef.current?.(md)
    },
  })

  // Sync external value changes
  const prevValueRef = useRef(value)
  useEffect(() => {
    if (!editor || value === prevValueRef.current) return
    prevValueRef.current = value
    const currentMd = getMarkdown(editor)
    if (currentMd !== value) {
      editor.commands.setContent(value)
    }
  }, [value, editor])

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly)
  }, [readOnly, editor])

  if (!editor) return null

  const ToolBtn = ({
    onClick, active, title, children,
  }: {
    onClick: () => void
    active?: boolean
    title: string
    children: React.ReactNode
  }) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={cn(
        'p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
        active && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  )

  return (
    <div className={cn('rounded-md border border-input bg-transparent', className)}>
      {!readOnly && (
        <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-input">
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (⌘B)">
            <Bold className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (⌘I)">
            <Italic className="h-3.5 w-3.5" />
          </ToolBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">
            <Heading1 className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">
            <Heading2 className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3">
            <Heading3 className="h-3.5 w-3.5" />
          </ToolBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
            <List className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">
            <Code className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
            <Minus className="h-3.5 w-3.5" />
          </ToolBtn>
        </div>
      )}
      <EditorContent
        editor={editor}
        style={{ minHeight }}
      />
    </div>
  )
}
